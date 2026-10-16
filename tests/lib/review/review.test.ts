import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { createPostgresRepository } from "@/lib/db/postgres-repository";
import { seedDemoData } from "@/lib/db/seed-demo";
import { withTransaction } from "@/lib/db/sql-client";
import { archiveDraftForUser, saveDraftForUser } from "@/lib/drafts/draft-service";
import { draftToRecords } from "@/lib/drafts/draft-input";
import { createDraft, setActor } from "@/lib/drafts/draft-store";
import {
  arrangeDraftPhotos,
  deleteDraftPhoto,
  readDraftPhoto,
  uploadDraftPhoto,
} from "@/lib/photos/photo-service";
import { isCompleteListing } from "@/lib/review/review-store";
import {
  type ReviewDeps,
  currentUserIsModerator,
  moderate,
  moderationQueue,
  ownerListingView,
  reviewDetails,
  submitForReview,
  withdrawSubmission,
} from "@/lib/review/review-service";
import { TRANSITIONS, USER_LISTING_STATUSES, canTransition } from "@/lib/review/statuses";
import { type TestDatabase, createTestDatabase } from "../db/test-database";
import { addUser, sampleDraft } from "../drafts/draft-fixtures";
import { jpeg, photoDepsFor, tempStorage } from "../photos/photo-fixtures";

// PGlite (real PostgreSQL SQL in process). Synthetic users and listings only.

let db: TestDatabase;
let temp: Awaited<ReturnType<typeof tempStorage>>;
beforeAll(async () => {
  db = await createTestDatabase();
  await seedDemoData(db);
  for (const id of ["owner-a", "owner-b", "mod-1", "mod-2", "plain"]) await addUser(db, id);
  await db.query(
    "INSERT INTO user_roles (user_id, role) VALUES ('mod-1', 'moderator'), ('mod-2', 'moderator')",
  );
  temp = await tempStorage();
}, 60_000);
afterAll(async () => {
  await db.close();
  await temp.cleanup();
});

const generous = () => ({
  submit: createRateLimiter({ limit: 10_000, windowMs: 60_000 }),
  decide: createRateLimiter({ limit: 10_000, windowMs: 60_000 }),
});
const as = (userId: string | null): ReviewDeps => ({
  currentUserId: async () => userId,
  withConnection: (work) => work(db),
  limiters: generous(),
});
const photosAs = (userId: string | null) => photoDepsFor(db, userId, temp.storage);

async function draft(owner = "owner-a", withPhoto = true) {
  // Directly through the store: the per-process save limiter is tested elsewhere.
  const records = draftToRecords(sampleDraft());
  if (!records.ok) throw new Error("sample draft is invalid");
  const id = await createDraft(db, owner, records.item);
  if (withPhoto) {
    const uploaded = await uploadDraftPhoto(photosAs(owner), id, await jpeg(20, 20));
    if (!uploaded.ok) throw new Error(uploaded.reason);
  }
  return id;
}

async function statusOf(id: string) {
  const { rows } = await db.query<{ status: string }>("SELECT status FROM listings WHERE id = $1", [
    id,
  ]);
  return rows[0].status;
}

async function inStatus(status: string, owner = "owner-a") {
  const id = await draft(owner);
  if (status === "draft") return id;
  if (status === "archived") {
    expect(await archiveDraftForUser(as(owner), id)).toBe(true);
    return id;
  }
  expect(await submitForReview(as(owner), id)).toEqual({ ok: true });
  if (status === "approved") await moderate(as("mod-1"), id, "approve", null);
  if (status === "changes_requested") await moderate(as("mod-1"), id, "request-changes", "fix");
  if (status === "rejected") await moderate(as("mod-1"), id, "reject", "no");
  expect(await statusOf(id)).toBe(status);
  return id;
}

/** Tries a raw status change as the given actor inside a transaction that is rolled back. */
async function tryRaw(id: string, to: string, actor: string, role: "owner" | "moderator") {
  await db.exec("BEGIN");
  try {
    await setActor(db, actor, role, "a reason");
    await db.query("UPDATE listings SET status = $2 WHERE id = $1", [id, to]);
    return true;
  } catch {
    return false;
  } finally {
    await db.exec("ROLLBACK");
  }
}

describe("status transitions (database and application agree)", () => {
  it("allows exactly the listed transitions for owners and moderators", async () => {
    const owner = "owner-a";
    for (const from of USER_LISTING_STATUSES) {
      const id = await inStatus(from, owner);
      for (const to of USER_LISTING_STATUSES) {
        if (to === from) continue;
        for (const role of ["owner", "moderator"] as const) {
          const actor = role === "owner" ? owner : "mod-1";
          const allowed = await tryRaw(id, to, actor, role);
          expect(allowed, `${from} -> ${to} as ${role}`).toBe(canTransition(from, to, role));
        }
      }
      // Never public.
      expect(await tryRaw(id, "active", owner, "owner")).toBe(false);
      expect(await tryRaw(id, "active", "mod-1", "moderator")).toBe(false);
    }
    expect(TRANSITIONS.length).toBe(10);
  });

  it("refuses status changes without a stated actor, by strangers and by non-moderators", async () => {
    const id = await draft();
    await expect(
      db.query("UPDATE listings SET status = 'submitted' WHERE id = $1", [id]),
    ).rejects.toThrow();
    expect(await tryRaw(id, "submitted", "owner-b", "owner")).toBe(false);
    const submitted = await inStatus("submitted");
    expect(await tryRaw(submitted, "approved", "plain", "moderator")).toBe(false);
    expect(await tryRaw(submitted, "approved", "owner-a", "moderator")).toBe(false);
  });

  it("requires new user listings to start as drafts", async () => {
    await expect(
      db.query(
        `INSERT INTO listings (id, property_id, title, transaction_type, asking_amount,
           asking_currency, status, data_source, owner_user_id)
         SELECT 'ul-00000000-0000-0000-0000-00000000aaaa', property_id, title, transaction_type,
           asking_amount, asking_currency, 'approved', 'user', owner_user_id
         FROM listings WHERE data_source = 'user' LIMIT 1`,
      ),
    ).rejects.toThrow();
  });
});

describe("submitting", () => {
  it("submits a complete listing with a photo, once", async () => {
    const id = await draft();
    expect(await submitForReview(as("owner-a"), id)).toEqual({ ok: true });
    expect(await statusOf(id)).toBe("submitted");
    expect(await submitForReview(as("owner-a"), id)).toEqual({ ok: false, reason: "conflict" });
    const { rows } = await db.query<{ submitted_at: string | null }>(
      "SELECT submitted_at FROM listings WHERE id = $1",
      [id],
    );
    expect(rows[0].submitted_at).not.toBeNull();
  });

  it("requires at least one stored photo", async () => {
    const id = await draft("owner-a", false);
    expect(await submitForReview(as("owner-a"), id)).toEqual({ ok: false, reason: "no-photo" });
    expect(await statusOf(id)).toBe("draft");
  });

  it("requires a complete listing", async () => {
    const id = await draft();
    const view = await ownerListingView(as("owner-a"), id);
    expect(isCompleteListing(view!.item)).toBe(true);
    const broken = { ...view!.item, property: { ...view!.item.property, areaSqm: 0 } };
    expect(isCompleteListing(broken)).toBe(false);
  });

  it("is only possible for the owner, signed in", async () => {
    const id = await draft();
    expect(await submitForReview(as(null), id)).toEqual({ ok: false, reason: "unauthenticated" });
    expect(await submitForReview(as("owner-b"), id)).toEqual({ ok: false, reason: "not-found" });
    expect(await submitForReview(as("owner-a"), "demo-listing-1")).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await statusOf(id)).toBe("draft");
  });

  it("is rate limited per user", async () => {
    const deps: ReviewDeps = {
      ...as("owner-a"),
      limiters: { ...generous(), submit: createRateLimiter({ limit: 1, windowMs: 60_000 }) },
    };
    const first = await draft();
    const second = await draft();
    expect(await submitForReview(deps, first)).toEqual({ ok: true });
    expect(await submitForReview(deps, second)).toEqual({ ok: false, reason: "rate-limited" });
  });

  it("can be withdrawn only before a decision", async () => {
    const id = await inStatus("submitted");
    expect(await withdrawSubmission(as("owner-b"), id)).toEqual({ ok: false, reason: "not-found" });
    expect(await withdrawSubmission(as("owner-a"), id)).toEqual({ ok: true });
    expect(await statusOf(id)).toBe("draft");
    const approved = await inStatus("approved");
    expect(await withdrawSubmission(as("owner-a"), approved)).toEqual({
      ok: false,
      reason: "conflict",
    });
  });
});

describe("editing rules per status", () => {
  it("allows edits and photo changes only in draft and changes_requested", async () => {
    for (const status of ["submitted", "approved", "rejected"]) {
      const id = await inStatus(status);
      const save = await saveDraftForUser(as("owner-a"), sampleDraft({ price: "99999" }), id);
      expect(save, status).toEqual({ ok: false, reason: "not-found" });
      expect((await uploadDraftPhoto(photosAs("owner-a"), id, await jpeg())).ok, status).toBe(
        false,
      );
      const view = await ownerListingView(as("owner-a"), id);
      const photoId = view!.photos[0].id;
      expect((await arrangeDraftPhotos(photosAs("owner-a"), id, { coverId: photoId })).ok).toBe(
        false,
      );
      expect((await deleteDraftPhoto(photosAs("owner-a"), id, photoId)).ok).toBe(false);
      // The database refuses direct changes as well.
      await expect(
        db.query("UPDATE listings SET title = 'changed' WHERE id = $1", [id]),
      ).rejects.toThrow();
      await expect(
        db.query("DELETE FROM listing_images WHERE listing_id = $1", [id]),
      ).rejects.toThrow();
    }
    const changes = await inStatus("changes_requested");
    expect(
      (await saveDraftForUser(as("owner-a"), sampleDraft({ price: "99999" }), changes)).ok,
    ).toBe(true);
    expect((await uploadDraftPhoto(photosAs("owner-a"), changes, await jpeg())).ok).toBe(true);
    expect(await submitForReview(as("owner-a"), changes)).toEqual({ ok: true });
  });

  it("treats rejection as final and keeps archiving consistent", async () => {
    const rejected = await inStatus("rejected");
    expect(await submitForReview(as("owner-a"), rejected)).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect(await archiveDraftForUser(as("owner-a"), rejected)).toBe(true);
    const submitted = await inStatus("submitted");
    expect(await archiveDraftForUser(as("owner-a"), submitted)).toBe(false);
    const approved = await inStatus("approved");
    expect(await archiveDraftForUser(as("owner-b"), approved)).toBe(false);
    expect(await archiveDraftForUser(as("owner-a"), approved)).toBe(true);
    expect(await ownerListingView(as("owner-a"), approved)).toBeNull();
  });
});

describe("moderation", () => {
  it("lets only moderators see the queue and decide, never on their own listings", async () => {
    const id = await inStatus("submitted", "owner-b");
    expect(await currentUserIsModerator(as("plain"))).toBe(false);
    expect(await currentUserIsModerator(as("mod-1"))).toBe(true);
    expect(await moderationQueue(as("plain"), 1)).toBeNull();
    expect(await moderationQueue(as(null), 1)).toBeNull();
    expect(await reviewDetails(as("plain"), id)).toBeNull();
    expect(await moderate(as("plain"), id, "approve", null)).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(await moderate(as(null), id, "approve", null)).toEqual({
      ok: false,
      reason: "unauthenticated",
    });

    const queue = await moderationQueue(as("mod-1"), 1);
    expect(queue!.entries.some((entry) => entry.id === id)).toBe(true);
    const details = await reviewDetails(as("mod-1"), id);
    expect(details!.photos.length).toBe(1);

    // A moderator's own listing: not in their queue, not reviewable, not decidable.
    await addUser(db, "mod-own");
    await db.query("INSERT INTO user_roles (user_id, role) VALUES ('mod-own', 'moderator')");
    const own = await inStatus("submitted", "mod-own");
    expect((await moderationQueue(as("mod-own"), 1))!.entries.some((e) => e.id === own)).toBe(
      false,
    );
    expect(await reviewDetails(as("mod-own"), own)).toBeNull();
    expect(await moderate(as("mod-own"), own, "approve", null)).toEqual({
      ok: false,
      reason: "own-listing",
    });
    expect(await moderate(as("mod-1"), own, "approve", null)).toEqual({ ok: true });
  });

  it("requires a reason for change requests and rejections", async () => {
    const id = await inStatus("submitted");
    for (const reason of [null, "", "   ", "x".repeat(1001), 42]) {
      expect(await moderate(as("mod-1"), id, "reject", reason)).toEqual({
        ok: false,
        reason: "reason-required",
      });
      expect(await moderate(as("mod-1"), id, "request-changes", reason)).toEqual({
        ok: false,
        reason: "reason-required",
      });
    }
    expect(await statusOf(id)).toBe("submitted");
    await db.exec("BEGIN");
    await setActor(db, "mod-1", "moderator", null);
    await expect(
      db.query("UPDATE listings SET status = 'rejected' WHERE id = $1", [id]),
    ).rejects.toThrow();
    await db.exec("ROLLBACK");
  });

  it("accepts only one of two simultaneous decisions", async () => {
    const id = await inStatus("submitted");
    let chain: Promise<unknown> = Promise.resolve();
    const serial = (userId: string): ReviewDeps => ({
      ...as(userId),
      withConnection: (work) => {
        const run = chain.then(() => work(db));
        chain = run.catch(() => {});
        return run;
      },
    });
    const results = await Promise.all([
      moderate(serial("mod-1"), id, "approve", null),
      moderate(serial("mod-2"), id, "reject", "duplicate"),
    ]);
    expect(results.filter((r) => r.ok).length).toBe(1);
    expect(results.filter((r) => !r.ok).map((r) => !r.ok && r.reason)).toEqual(["conflict"]);
    const { rows } = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM listing_status_events WHERE listing_id = $1 AND actor_role = 'moderator'",
      [id],
    );
    expect(rows[0].n).toBe(1);
  });

  it("lets moderators read photos only while a listing is submitted", async () => {
    const id = await inStatus("submitted", "owner-b");
    const photoId = (await ownerListingView(as("owner-b"), id))!.photos[0].id;
    expect(await readDraftPhoto(photosAs("mod-1"), id, photoId)).not.toBeNull();
    expect(await readDraftPhoto(photosAs("plain"), id, photoId)).toBeNull();
    expect(await readDraftPhoto(photosAs("owner-a"), id, photoId)).toBeNull();
    await moderate(as("mod-1"), id, "approve", null);
    expect(await readDraftPhoto(photosAs("mod-1"), id, photoId)).toBeNull();
    expect(await readDraftPhoto(photosAs("owner-b"), id, photoId)).not.toBeNull();
  });
});

describe("audit history", () => {
  it("records every change with role and reason, and cannot be altered", async () => {
    const id = await inStatus("submitted");
    await moderate(as("mod-1"), id, "request-changes", "  ფოტო ბნელია  ");
    await submitForReview(as("owner-a"), id);
    await moderate(as("mod-2"), id, "approve", null);
    const view = await ownerListingView(as("owner-a"), id);
    expect(view!.history.map((e) => [e.from, e.to, e.actorRole, e.reason])).toEqual([
      ["draft", "submitted", "owner", null],
      ["submitted", "changes_requested", "moderator", "ფოტო ბნელია"],
      ["changes_requested", "submitted", "owner", null],
      ["submitted", "approved", "moderator", null],
    ]);
    await expect(
      db.query("UPDATE listing_status_events SET reason = 'edited' WHERE listing_id = $1", [id]),
    ).rejects.toThrow();
    await expect(
      db.query("DELETE FROM listing_status_events WHERE listing_id = $1", [id]),
    ).rejects.toThrow();
    await expect(db.exec("TRUNCATE listing_status_events")).rejects.toThrow();
    await expect(
      db.query("INSERT INTO user_roles (user_id, role) VALUES ('plain', 'admin')"),
    ).rejects.toThrow();
  });
});

describe("privacy of listings under review", () => {
  it("keeps every review status out of public data", async () => {
    const ids = [
      await inStatus("submitted"),
      await inStatus("approved"),
      await inStatus("changes_requested"),
      await inStatus("rejected"),
    ];
    const repository = createPostgresRepository(db);
    const result = await repository.searchListings({
      filters: {},
      display: "USD",
      rateState: { status: "unavailable" },
      sort: "default",
    });
    const rent = await repository.searchListings({
      filters: { transaction: "rent" },
      display: "USD",
      rateState: { status: "unavailable" },
      sort: "default",
    });
    const publicIds = [...result.items, ...rent.items].map((item) => item.listing.id);
    const allIds = await repository.getListingIds();
    const active = (await repository.getActiveListings()).map((item) => item.listing.id);
    for (const id of ids) {
      expect(publicIds).not.toContain(id);
      expect(allIds).not.toContain(id);
      expect(active).not.toContain(id);
      expect(await repository.getListingById(id)).toBeNull();
      expect(await repository.getListingImages(id)).toEqual([]);
    }
    expect(await repository.getListingsByIds(ids)).toEqual([]);
    const subject = await repository.getListingById("demo-listing-1");
    const candidates = await repository.findComparableCandidates(subject!);
    expect(candidates.some((c) => ids.includes(c.listing.id))).toBe(false);
  });

  it("survives a restart: a new repository and new deps read the same states", async () => {
    const id = await inStatus("approved");
    const fresh: ReviewDeps = {
      currentUserId: async () => "owner-a",
      withConnection: (w) => w(db),
    };
    expect((await ownerListingView(fresh, id))!.status).toBe("approved");
  });
});

describe("rolling back", () => {
  it("leaves no audit row when the change itself fails", async () => {
    const id = await draft("owner-a", false);
    const before = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM listing_status_events WHERE listing_id = $1",
      [id],
    );
    await withTransaction(db, async () => {
      await setActor(db, "owner-a", "owner");
      await db.query("UPDATE listings SET status = 'submitted' WHERE id = $1", [id]);
    }).catch(() => {});
    const after = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM listing_status_events WHERE listing_id = $1",
      [id],
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
    expect(await statusOf(id)).toBe("draft");
  });
});
