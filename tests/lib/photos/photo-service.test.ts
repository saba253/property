import { readdir } from "node:fs/promises";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { createPostgresRepository } from "@/lib/db/postgres-repository";
import { seedDemoData } from "@/lib/db/seed-demo";
import type { SqlConnection } from "@/lib/db/sql-client";
import { archiveDraftForUser, saveDraftForUser } from "@/lib/drafts/draft-service";
import {
  type PhotoDeps,
  arrangeDraftPhotos,
  deleteDraftPhoto,
  listDraftPhotos,
  readDraftPhoto,
  uploadDraftPhoto,
} from "@/lib/photos/photo-service";
import { createLocalPhotoStorage } from "@/lib/photos/storage";
import { type TestDatabase, createTestDatabase } from "../db/test-database";
import { addUser, depsFor, sampleDraft } from "../drafts/draft-fixtures";
import { jpeg, photoDepsFor, png, tempStorage, webp } from "./photo-fixtures";

// PGlite (real PostgreSQL SQL in process) + a temporary storage folder. Synthetic data only.

let db: TestDatabase;
let temp: Awaited<ReturnType<typeof tempStorage>>;
beforeAll(async () => {
  db = await createTestDatabase();
  await seedDemoData(db);
  await addUser(db, "user-a");
  await addUser(db, "user-b");
  temp = await tempStorage();
}, 60_000);
afterAll(async () => {
  await db.close();
  await temp.cleanup();
});

const asA = () => photoDepsFor(db, "user-a", temp.storage);
const asB = () => photoDepsFor(db, "user-b", temp.storage);
const anonymous = () => photoDepsFor(db, null, temp.storage);

async function newDraft(user = "user-a") {
  const result = await saveDraftForUser(depsFor(db, user), sampleDraft(), null);
  if (!result.ok) throw new Error(result.reason);
  return result.id;
}

async function upload(deps: PhotoDeps, draftId: string, bytes?: Uint8Array) {
  const result = await uploadDraftPhoto(deps, draftId, bytes ?? (await jpeg()));
  if (!result.ok) throw new Error(`upload failed: ${result.reason}`);
  return result;
}

async function storedFiles(): Promise<string[]> {
  const entries = await readdir(temp.root, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).map((e) => e.name);
}

async function keysOf(draftId: string): Promise<string[]> {
  const { rows } = await db.query<{ storage_key: string }>(
    "SELECT storage_key FROM listing_images WHERE listing_id = $1 ORDER BY sort_order",
    [draftId],
  );
  return rows.map((row) => row.storage_key);
}

describe("uploading", () => {
  it("stores JPEG, PNG and WebP uploads as processed WebP files with metadata rows", async () => {
    const draft = await newDraft();
    await upload(asA(), draft, await jpeg(80, 60));
    await upload(asA(), draft, await png(30, 40));
    const last = await upload(asA(), draft, await webp(50, 50));
    expect(last.photos.map((p) => [p.order, p.isCover, p.width, p.height])).toEqual([
      [0, true, 80, 60],
      [1, false, 30, 40],
      [2, false, 50, 50],
    ]);
    expect(last.photo.url).toBe(`/api/drafts/${draft}/photos/${last.photo.id}`);
    const { rows } = await db.query<{ source_kind: string; mime_type: string; src: null }>(
      "SELECT source_kind, mime_type, src FROM listing_images WHERE listing_id = $1",
      [draft],
    );
    expect(rows.every((r) => r.source_kind === "upload" && r.mime_type === "image/webp")).toBe(
      true,
    );
    expect(rows.every((r) => r.src === null)).toBe(true);
    for (const key of await keysOf(draft)) expect(await storedFiles()).toContain(key);

    const file = await readDraftPhoto(asA(), draft, last.photo.id);
    expect(file?.mimeType).toBe("image/webp");
    expect((await sharp(file!.data).metadata()).format).toBe("webp");
  });

  it("refuses invalid content without writing a file or a row", async () => {
    const draft = await newDraft();
    const before = await storedFiles();
    const fake = new TextEncoder().encode("<?php system($_GET['c']); ?>");
    expect(await uploadDraftPhoto(asA(), draft, fake)).toEqual({ ok: false, reason: "type" });
    expect(await storedFiles()).toEqual(before);
    expect(await keysOf(draft)).toEqual([]);
  });

  it("allows at most 10 photos per draft", async () => {
    const draft = await newDraft();
    const bytes = await jpeg(20, 20);
    for (let i = 0; i < 10; i++) await upload(asA(), draft, bytes);
    const before = (await storedFiles()).length;
    expect(await uploadDraftPhoto(asA(), draft, bytes)).toEqual({ ok: false, reason: "limit" });
    expect((await storedFiles()).length).toBe(before);
    expect((await listDraftPhotos(asA(), draft))?.length).toBe(10);
  });

  it("keeps the limit with many simultaneous uploads (serialized connection use)", async () => {
    const draft = await newDraft();
    // One PGlite connection: each use waits for the previous one, like a pool of size 1.
    let chain: Promise<unknown> = Promise.resolve();
    const deps: PhotoDeps = {
      ...asA(),
      withConnection: (work) => {
        const run = chain.then(() => work(db));
        chain = run.catch(() => {});
        return run;
      },
    };
    const bytes = await jpeg(20, 20);
    const results = await Promise.all(
      Array.from({ length: 12 }, () => uploadDraftPhoto(deps, draft, bytes)),
    );
    expect(results.filter((r) => r.ok).length).toBe(10);
    expect(results.filter((r) => !r.ok).map((r) => !r.ok && r.reason)).toEqual(["limit", "limit"]);
    const keys = await keysOf(draft);
    expect(keys.length).toBe(10);
    const files = await storedFiles();
    for (const key of keys) expect(files).toContain(key);
  });
});

describe("access control", () => {
  it("refuses anonymous requests", async () => {
    const draft = await newDraft();
    const photo = (await upload(asA(), draft)).photo;
    expect(await listDraftPhotos(anonymous(), draft)).toBeNull();
    expect(await uploadDraftPhoto(anonymous(), draft, await jpeg())).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
    expect(await arrangeDraftPhotos(anonymous(), draft, { coverId: photo.id })).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
    expect(await deleteDraftPhoto(anonymous(), draft, photo.id)).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
    expect(await readDraftPhoto(anonymous(), draft, photo.id)).toBeNull();
  });

  it("never lets another user list, read, upload, reorder or delete", async () => {
    const draft = await newDraft("user-a");
    const first = (await upload(asA(), draft)).photo;
    const second = (await upload(asA(), draft)).photo;
    const filesBefore = await storedFiles();

    expect(await listDraftPhotos(asB(), draft)).toBeNull();
    expect(await readDraftPhoto(asB(), draft, first.id)).toBeNull();
    expect(await uploadDraftPhoto(asB(), draft, await jpeg())).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(
      await arrangeDraftPhotos(asB(), draft, { order: [second.id, first.id], coverId: second.id }),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(await deleteDraftPhoto(asB(), draft, first.id)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await storedFiles()).toEqual(filesBefore);

    // B's own draft cannot reach A's photos either.
    const bDraft = await newDraft("user-b");
    expect(await readDraftPhoto(asB(), bDraft, first.id)).toBeNull();
    expect(await deleteDraftPhoto(asB(), bDraft, first.id)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await arrangeDraftPhotos(asB(), bDraft, { coverId: first.id })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect((await listDraftPhotos(asA(), draft))?.map((p) => [p.id, p.isCover])).toEqual([
      [first.id, true],
      [second.id, false],
    ]);
  });

  it("keeps archived drafts' photos but makes them unreachable and read-only", async () => {
    const draft = await newDraft();
    const photo = (await upload(asA(), draft)).photo;
    expect(await archiveDraftForUser(depsFor(db, "user-a"), draft)).toBe(true);
    expect(await listDraftPhotos(asA(), draft)).toBeNull();
    expect(await readDraftPhoto(asA(), draft, photo.id)).toBeNull();
    expect((await uploadDraftPhoto(asA(), draft, await jpeg())).ok).toBe(false);
    expect((await deleteDraftPhoto(asA(), draft, photo.id)).ok).toBe(false);
    const keys = await keysOf(draft);
    expect(keys.length).toBe(1);
    expect(await storedFiles()).toContain(keys[0]);
  });

  it("limits uploads per user", async () => {
    const draft = await newDraft();
    const deps: PhotoDeps = {
      ...asA(),
      limiters: {
        upload: createRateLimiter({ limit: 2, windowMs: 60_000 }),
        change: createRateLimiter({ limit: 2, windowMs: 60_000 }),
      },
    };
    const bytes = await jpeg(10, 10);
    expect((await uploadDraftPhoto(deps, draft, bytes)).ok).toBe(true);
    expect((await uploadDraftPhoto(deps, draft, bytes)).ok).toBe(true);
    expect(await uploadDraftPhoto(deps, draft, bytes)).toEqual({
      ok: false,
      reason: "rate-limited",
    });
  });

  it("refuses malformed ids", async () => {
    const draft = await newDraft();
    expect(await listDraftPhotos(asA(), "../../etc")).toBeNull();
    expect(await readDraftPhoto(asA(), draft, "../secret")).toBeNull();
    expect((await uploadDraftPhoto(asA(), "demo-listing-1", await jpeg())).ok).toBe(false);
  });
});

describe("arranging", () => {
  it("reorders, changes the cover and sets descriptions; foreign or partial lists change nothing", async () => {
    const draft = await newDraft();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await upload(asA(), draft)).photo.id);
    const [a, b, c] = ids;

    const reordered = await arrangeDraftPhotos(asA(), draft, { order: [c, a, b] });
    expect(reordered.ok && reordered.photos.map((p) => p.id)).toEqual([c, a, b]);

    const cover = await arrangeDraftPhotos(asA(), draft, { coverId: b });
    expect(cover.ok && cover.photos.filter((p) => p.isCover).map((p) => p.id)).toEqual([b]);

    const described = await arrangeDraftPhotos(asA(), draft, {
      alt: { id: a, text: "  მისაღები ოთახი  " },
    });
    expect(described.ok && described.photos.find((p) => p.id === a)?.alt).toBe("მისაღები ოთახი");
    const cleared = await arrangeDraftPhotos(asA(), draft, { alt: { id: a, text: "" } });
    expect(cleared.ok && cleared.photos.find((p) => p.id === a)?.alt).toBe("");

    const foreignDraft = await newDraft();
    const foreign = (await upload(asA(), foreignDraft)).photo.id;
    const invalid = [
      { order: [a, b] },
      { order: [a, b, c, c] },
      { order: [a, b, foreign] },
      { order: [b, a, c], coverId: foreign },
      { coverId: "ph-not-real" },
      { alt: { id: a, text: "x".repeat(151) } },
      { order: "a,b,c" },
      {},
      null,
    ];
    for (const change of invalid) {
      expect(await arrangeDraftPhotos(asA(), draft, change)).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
    // Nothing above was applied, not even the valid order of the mixed request.
    expect((await listDraftPhotos(asA(), draft))?.map((p) => [p.id, p.order, p.isCover])).toEqual([
      [c, 0, false],
      [a, 1, false],
      [b, 2, true],
    ]);
  });
});

describe("deleting", () => {
  it("removes the row and the file, closes the order and picks a new cover", async () => {
    const draft = await newDraft();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await upload(asA(), draft)).photo.id);
    const [cover, second, third] = ids;
    const coverKey = (await keysOf(draft))[0];

    const result = await deleteDraftPhoto(asA(), draft, cover);
    expect(result.ok && result.photos.map((p) => [p.id, p.order, p.isCover])).toEqual([
      [second, 0, true],
      [third, 1, false],
    ]);
    expect(await storedFiles()).not.toContain(coverKey);

    await deleteDraftPhoto(asA(), draft, third);
    const last = await deleteDraftPhoto(asA(), draft, second);
    expect(last.ok && last.photos).toEqual([]);
    expect(await keysOf(draft)).toEqual([]);
  });
});

describe("failures and restarts", () => {
  it("removes the stored file when the database refuses the row", async () => {
    const draft = await newDraft();
    const before = await storedFiles();
    const failing: SqlConnection = {
      ...db,
      query: async (text, params) => {
        if (text.includes("INSERT INTO listing_images")) throw new Error("simulated failure");
        return db.query(text, params);
      },
    };
    const deps: PhotoDeps = { ...asA(), withConnection: (work) => work(failing) };
    expect(await uploadDraftPhoto(deps, draft, await jpeg())).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(await storedFiles()).toEqual(before);
    expect(await keysOf(draft)).toEqual([]);
    // The transaction was rolled back: the draft is usable afterwards.
    await upload(asA(), draft);
  });

  it("keeps the file once its row is committed, even if a later read fails", async () => {
    const draft = await newDraft();
    let calls = 0;
    // 1: pre-check, 2: insert (commits), 3: the listing afterwards fails.
    const deps: PhotoDeps = {
      ...asA(),
      withConnection: (work) => {
        calls++;
        if (calls === 3) return Promise.reject(new Error("simulated read failure"));
        return work(db);
      },
    };
    const result = await uploadDraftPhoto(deps, draft, await jpeg());
    expect(result.ok).toBe(true);
    const keys = await keysOf(draft);
    expect(keys.length).toBe(1);
    expect(await storedFiles()).toContain(keys[0]);
  });

  it("records nothing when storing the file fails", async () => {
    const draft = await newDraft();
    const deps: PhotoDeps = {
      ...asA(),
      storage: { ...temp.storage, put: async () => Promise.reject(new Error("disk full")) },
    };
    expect(await uploadDraftPhoto(deps, draft, await jpeg())).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(await keysOf(draft)).toEqual([]);
  });

  it("serves the same photos after a restart (new storage adapter and service deps)", async () => {
    const draft = await newDraft();
    const photo = (await upload(asA(), draft, await png(33, 22))).photo;
    const restarted = photoDepsFor(db, "user-a", createLocalPhotoStorage(temp.root));
    expect((await listDraftPhotos(restarted, draft))?.map((p) => p.id)).toEqual([photo.id]);
    const file = await readDraftPhoto(restarted, draft, photo.id);
    expect((await sharp(file!.data).metadata()).width).toBe(33);
  });
});

describe("privacy of draft photos in public data", () => {
  it("never appear in public image, cover, search or batch queries", async () => {
    const draft = await newDraft();
    await upload(asA(), draft);
    const repository = createPostgresRepository(db);
    expect(await repository.getListingImages(draft)).toEqual([]);
    expect((await repository.getListingCovers([draft]))[draft]).toEqual({
      coverImage: null,
      imageCount: 0,
    });
    expect(await repository.getListingsByIds([draft])).toEqual([]);
    expect((await repository.getListingIds()).includes(draft)).toBe(false);
    // Demo images are unaffected.
    const demo = await repository.getListingImages("demo-listing-1");
    expect(demo.length).toBeGreaterThan(0);
    expect(demo.every((image) => image.source.kind !== "photo" || image.source.src)).toBe(true);
  });

  it("are refused by the database on demo listings, and demo-style images on drafts", async () => {
    const draft = await newDraft();
    const insert = (listingId: string, kind: string) =>
      db.query(
        `INSERT INTO listing_images (id, listing_id, sort_order, alt, source_kind, src, storage_key,
           mime_type, byte_size, width, height)
         VALUES ($1, $2, 50, 'x', $3, $4, $5, $6, $7, 10, 10)`,
        kind === "upload"
          ? [`t-${Date.now()}`, listingId, kind, null, `${"0".repeat(31)}1.webp`, "image/webp", 100]
          : [`t-${Date.now()}`, listingId, kind, "https://example.com/x.jpg", null, null, null],
      );
    await expect(insert("demo-listing-1", "upload")).rejects.toThrow();
    await expect(insert(draft, "photo")).rejects.toThrow();
  });
});
