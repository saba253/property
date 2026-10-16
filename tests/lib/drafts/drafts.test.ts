import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { selectComparables } from "@/lib/analytics/comparables";
import { createPostgresRepository } from "@/lib/db/postgres-repository";
import { seedDemoData } from "@/lib/db/seed-demo";
import { draftToRecords, parseDraftInput, recordsToDraft } from "@/lib/drafts/draft-input";
import {
  archiveDraftForUser,
  getDraftForUser,
  listDraftsForUser,
  saveDraftForUser,
} from "@/lib/drafts/draft-service";
import { createDraft } from "@/lib/drafts/draft-store";
import { createMemoryRepository } from "@/lib/repository/memory-repository";
import { type TestDatabase, createTestDatabase } from "../db/test-database";
import { addUser, depsFor, sampleDraft } from "./draft-fixtures";

// PGlite integration tests (real PostgreSQL SQL, in process). Synthetic users and drafts only.

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  await seedDemoData(db);
  await addUser(db, "user-a");
  await addUser(db, "user-b");
}, 60_000);
afterAll(() => db.close());

const asA = () => depsFor(db, "user-a");
const asB = () => depsFor(db, "user-b");

async function save(deps = asA(), input: unknown = sampleDraft(), id: string | null = null) {
  const result = await saveDraftForUser(deps, input, id);
  if (!result.ok) throw new Error(`save failed: ${result.reason}`);
  return result.id;
}

describe("creating private drafts", () => {
  it("requires a signed-in user", async () => {
    expect(await saveDraftForUser(depsFor(db, null), sampleDraft(), null)).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
    expect(await listDraftsForUser(depsFor(db, null))).toBeNull();
  });

  it("stores property, listing and characteristics as the session's user, with the original price", async () => {
    const id = await save();
    const { rows } = await db.query<{
      owner_user_id: string;
      status: string;
      data_source: string;
      asking_amount: string;
      asking_currency: string;
      title: string;
    }>(
      `SELECT owner_user_id, status, data_source, asking_amount::text, asking_currency, title
       FROM listings WHERE id = $1`,
      [id],
    );
    expect(rows[0]).toMatchObject({
      owner_user_id: "user-a",
      status: "draft",
      data_source: "user",
      asking_amount: "145000",
      asking_currency: "GEL",
    });
    // An empty title gets the neutral suggested title from the entered facts.
    expect(rows[0].title).toContain("ვაკე");
    const draft = await getDraftForUser(asA(), id);
    expect(draft?.property).toMatchObject({
      type: "apartment",
      areaSqm: 72.5,
      floor: 4,
      totalFloors: 9,
    });
    expect(draft?.property.features).toEqual({ balcony: "yes", elevator: "no" });
    expect(draft?.listing.equipment).toEqual({ furniture: "yes" });
  });

  it("ignores forged owner, status, id and data source fields", async () => {
    const id = await save(asA(), {
      ...sampleDraft({ title: "ყალბი ველებით" }),
      ownerUserId: "user-b",
      owner_user_id: "user-b",
      status: "active",
      dataSource: "demo",
      id: "demo-listing-1",
    });
    const { rows } = await db.query<{ owner_user_id: string; status: string; data_source: string }>(
      "SELECT owner_user_id, status, data_source FROM listings WHERE id = $1",
      [id],
    );
    expect(rows[0]).toEqual({ owner_user_id: "user-a", status: "draft", data_source: "user" });
  });

  it("refuses invalid drafts on the server without writing anything", async () => {
    const before = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM properties");
    for (const input of [
      null,
      "text",
      sampleDraft({ price: "0" }),
      sampleDraft({ price: "-5" }),
      sampleDraft({ areaSqm: "0" }),
      sampleDraft({ citySlug: "kutaisi" }),
      sampleDraft({ rooms: "1", bedrooms: "3" }),
      sampleDraft({ floor: "12", totalFloors: "9" }),
      sampleDraft({ transactionType: "rent", price: "500000" }),
      sampleDraft({ title: "ა".repeat(90) }),
    ]) {
      const result = await saveDraftForUser(asA(), input, null);
      expect(result.ok, JSON.stringify(input)?.slice(0, 80)).toBe(false);
    }
    const after = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM properties");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("keeps the amenity vocabulary: unknown keys and the removed bed item are dropped", () => {
    const draft = parseDraftInput({
      ...sampleDraft(),
      amenities: { bed: "yes", balcony: "yes", garage: "maybe", topFloor: "yes" },
    });
    expect(draft?.amenities).toEqual({ balcony: "yes" });
  });

  it("rolls back every row when a write fails half-way", async () => {
    const records = draftToRecords(sampleDraft());
    if (!records.ok) throw new Error("fixture invalid");
    const broken = {
      ...records.item,
      listing: { ...records.item.listing, equipment: { notAKey: "yes" } as never },
    };
    const before = await db.query<{ p: number; l: number }>(
      "SELECT (SELECT count(*) FROM properties)::int AS p, (SELECT count(*) FROM listings)::int AS l",
    );
    await expect(createDraft(db, "user-a", broken)).rejects.toThrow();
    const after = await db.query<{ p: number; l: number }>(
      "SELECT (SELECT count(*) FROM properties)::int AS p, (SELECT count(*) FROM listings)::int AS l",
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });
});

describe("ownership", () => {
  it("lists, opens, updates and archives only the user's own drafts", async () => {
    const mine = await save(asA(), sampleDraft({ title: "ა-ს დრაფტი" }));
    const theirs = await save(asB(), sampleDraft({ title: "ბ-ს დრაფტი" }));

    const listA = (await listDraftsForUser(asA()))!.map((d) => d.id);
    expect(listA).toContain(mine);
    expect(listA).not.toContain(theirs);

    // Another user's draft behaves like a missing one.
    expect(await getDraftForUser(asA(), theirs)).toBeNull();
    expect(await saveDraftForUser(asA(), sampleDraft({ title: "გადაწერა" }), theirs)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await archiveDraftForUser(asA(), theirs)).toBe(false);
    const untouched = await getDraftForUser(asB(), theirs);
    expect(untouched?.listing.title).toBe("ბ-ს დრაფტი");

    // The owner can update and reopen it.
    expect(
      await saveDraftForUser(asA(), sampleDraft({ title: "განახლებული", price: "150000" }), mine),
    ).toEqual({ ok: true, id: mine });
    const reopened = await getDraftForUser(asA(), mine);
    expect(recordsToDraft(reopened!)).toMatchObject({
      title: "განახლებული",
      price: "150000",
      currency: "GEL",
    });

    // Archiving is reversible removal: the row stays, it is just no longer listed.
    expect(await archiveDraftForUser(asA(), mine)).toBe(true);
    expect((await listDraftsForUser(asA()))!.map((d) => d.id)).not.toContain(mine);
    const { rows } = await db.query<{ status: string }>(
      "SELECT status FROM listings WHERE id = $1",
      [mine],
    );
    expect(rows[0].status).toBe("archived");
  });

  it("never touches demo listings and rejects malformed draft ids", async () => {
    expect(await saveDraftForUser(asA(), sampleDraft(), "demo-listing-1")).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await archiveDraftForUser(asA(), "demo-listing-1")).toBe(false);
    expect(await getDraftForUser(asA(), "' OR 1=1 --")).toBeNull();
    const { rows } = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM listings WHERE data_source = 'demo' AND (owner_user_id IS NOT NULL OR status <> 'active')",
    );
    expect(rows[0].n).toBe(0);
  });

  it("shows an empty list for a user without drafts", async () => {
    await addUser(db, "user-c");
    expect(await listDraftsForUser(depsFor(db, "user-c"))).toEqual([]);
  });
});

describe("drafts stay private", () => {
  it("never appear in public search, counts, facets, ids, batch lookups or comparables", async () => {
    const draftId = await save(asA(), sampleDraft({ title: "საიდუმლო დრაფტი" }));
    const repo = createPostgresRepository(db);
    const rate = { status: "unavailable" as const };
    const search = await repo.searchListings({
      filters: { citySlug: "tbilisi" },
      display: "USD",
      rateState: rate,
      sort: "default",
    });
    const ids = (items: { listing: { id: string } }[]) => items.map((item) => item.listing.id);
    expect(ids(search.items).every((id) => id.startsWith("demo-"))).toBe(true);
    // Exactly the same as the demo data without any database: drafts add nothing.
    const memory = await createMemoryRepository().searchListings({
      filters: { citySlug: "tbilisi" },
      display: "USD",
      rateState: rate,
      sort: "default",
    });
    expect(search.total).toBe(memory.total);
    expect(ids(search.items)).toEqual(ids(memory.items));
    expect(
      (await repo.getActiveListings()).every((item) => item.listing.dataSource === "demo"),
    ).toBe(true);
    expect(await repo.getListingIds()).not.toContain(draftId);
    expect(await repo.getListingById(draftId)).toBeNull();
    expect(await repo.getListingsByIds([draftId])).toEqual([]);
    const facets = await repo.getSearchFacets();
    expect(facets.totals).toEqual({ sale: 8, rent: 3 });
    const subject = (await repo.getListingById("demo-listing-1"))!;
    const candidates = await repo.findComparableCandidates(subject);
    expect(ids(candidates)).not.toContain(draftId);
    expect(selectComparables(subject, candidates)).toMatchObject({ status: "insufficient" });
  });

  it("cannot be published or given to nobody, by database rule", async () => {
    const draftId = await save();
    await expect(
      db.query("UPDATE listings SET status = 'active' WHERE id = $1", [draftId]),
    ).rejects.toThrow();
    await expect(
      db.query("UPDATE listings SET owner_user_id = NULL WHERE id = $1", [draftId]),
    ).rejects.toThrow();
    await expect(
      db.query("UPDATE listings SET status = 'draft' WHERE id = 'demo-listing-2'"),
    ).rejects.toThrow();
  });
});
