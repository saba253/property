import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { createPostgresRepository } from "@/lib/db/postgres-repository";
import { seedDemoData } from "@/lib/db/seed-demo";
import { withTransaction } from "@/lib/db/sql-client";
import { saveDraftForUser } from "@/lib/drafts/draft-service";
import { draftToRecords } from "@/lib/drafts/draft-input";
import { createDraft, setActor } from "@/lib/drafts/draft-store";
import {
  markAllNotificationsRead,
  markNotificationRead,
  notificationsForUser,
  unreadForUser,
} from "@/lib/notifications/notification-service";
import { arrangeDraftPhotos, readDraftPhoto, uploadDraftPhoto } from "@/lib/photos/photo-service";
import {
  type ReviewDeps,
  claimForReview,
  moderate,
  moderationQueue,
  ownerListingView,
  releaseReview,
  reviewDetails,
  reviewHistory,
  submitForReview,
  withdrawSubmission,
} from "@/lib/review/review-service";
import { CLAIM_MINUTES } from "@/lib/review/statuses";
import { type TestDatabase, createTestDatabase } from "../db/test-database";
import { addUser, sampleDraft } from "../drafts/draft-fixtures";
import { jpeg, photoDepsFor, tempStorage } from "../photos/photo-fixtures";

// Step 1.25 (migration 0006) on PGlite: database guards, claims, notifications, change tracking
// and history. Synthetic users and listings only.

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

async function draft(owner = "owner-a", overrides = {}) {
  const records = draftToRecords(sampleDraft(overrides));
  if (!records.ok) throw new Error("sample draft is invalid");
  const id = await createDraft(db, owner, records.item);
  const uploaded = await uploadDraftPhoto(photosAs(owner), id, await jpeg(20, 20));
  if (!uploaded.ok) throw new Error(uploaded.reason);
  return id;
}

async function submitted(owner = "owner-a", overrides = {}) {
  const id = await draft(owner, overrides);
  expect(await submitForReview(as(owner), id)).toEqual({ ok: true });
  return id;
}

async function one<T extends object>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0];
}

/**
 * Runs `sql` as `actor` in a transaction that is always rolled back: true when it succeeded,
 * otherwise false (the error message is kept in `lastError` for assertions).
 */
let lastError = "";
async function tryAs(
  actor: string | null,
  role: "owner" | "moderator",
  sql: string,
  params: unknown[] = [],
) {
  await db.exec("BEGIN");
  try {
    if (actor) await setActor(db, actor, role, "a reason");
    await db.query(sql, params);
    return true;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    return false;
  } finally {
    await db.exec("ROLLBACK");
  }
}

/** Moves a claim's expiry into the past (test only: triggers are skipped for this one change). */
async function expireClaim(id: string) {
  await db.exec("SET session_replication_role = replica");
  try {
    await db.query(
      "UPDATE listings SET review_claim_expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
      [id],
    );
  } finally {
    await db.exec("SET session_replication_role = origin");
  }
}

describe("database guards from the Step 1.24 review", () => {
  it("A: never moves a photo out of a frozen listing, or between listings at all", async () => {
    const frozen = await submitted();
    const editable = await draft();
    const photo = await one<{ id: string }>(
      "SELECT id FROM listing_images WHERE listing_id = $1 AND source_kind = 'upload'",
      [frozen],
    );
    // Old listing frozen, new listing editable: refused (0005 only checked the new one).
    await expect(
      db.query("UPDATE listing_images SET listing_id = $2, sort_order = 7 WHERE id = $1", [
        photo.id,
        editable,
      ]),
    ).rejects.toThrow(/cannot move/);
    // Between two editable drafts: refused too (uploads never move).
    const other = await draft();
    const movable = await one<{ id: string }>(
      "SELECT id FROM listing_images WHERE listing_id = $1",
      [other],
    );
    await expect(
      db.query("UPDATE listing_images SET listing_id = $2, sort_order = 7 WHERE id = $1", [
        movable.id,
        editable,
      ]),
    ).rejects.toThrow(/cannot move/);
    // Any other change of a frozen upload is refused as well.
    await expect(
      db.query("UPDATE listing_images SET alt = 'changed' WHERE id = $1", [photo.id]),
    ).rejects.toThrow(/photos cannot change in status submitted/);
    // Nothing changed.
    expect(
      (
        await one<{ listing_id: string }>("SELECT listing_id FROM listing_images WHERE id = $1", [
          photo.id,
        ])
      ).listing_id,
    ).toBe(frozen);
    // Ordinary editing of an editable draft still works.
    expect((await uploadDraftPhoto(photosAs("owner-a"), editable, await jpeg(30, 30))).ok).toBe(
      true,
    );
    const second = (await ownerListingView(as("owner-a"), editable))!.photos[1].id;
    expect((await arrangeDraftPhotos(photosAs("owner-a"), editable, { coverId: second })).ok).toBe(
      true,
    );
  });

  it("B: keeps data_source and the owner fixed", async () => {
    const id = await draft();
    for (const sql of [
      "UPDATE listings SET data_source = 'user' WHERE id = 'demo-listing-1'",
      "UPDATE properties SET data_source = 'user' WHERE id = (SELECT property_id FROM listings WHERE id = 'demo-listing-1')",
      `UPDATE listings SET data_source = 'demo' WHERE id = '${id}'`,
      `UPDATE properties SET data_source = 'demo' WHERE id = (SELECT property_id FROM listings WHERE id = '${id}')`,
      `UPDATE listings SET owner_user_id = 'owner-b' WHERE id = '${id}'`,
    ]) {
      expect(await tryAs("owner-a", "owner", sql), sql).toBe(false);
      expect(lastError, sql).toMatch(
        /data_source of (listings|properties) cannot change|owner of a listing cannot change/,
      );
      expect(await tryAs("mod-1", "moderator", sql), sql).toBe(false);
    }
    // A demo listing cannot become an approved user listing in one statement either.
    expect(
      await tryAs(
        "mod-1",
        "moderator",
        "UPDATE listings SET data_source = 'user', status = 'approved', owner_user_id = 'owner-b' WHERE id = 'demo-listing-1'",
      ),
    ).toBe(false);
    expect(lastError).toMatch(/cannot change/);
    // The demo seed (which upserts demo rows) still runs.
    await seedDemoData(db);
    const demo = await one<{ data_source: string }>(
      "SELECT data_source FROM listings WHERE id = 'demo-listing-1'",
    );
    expect(demo.data_source).toBe("demo");
  });
});

describe("claims", () => {
  it("lets only moderators claim other users' submitted listings", async () => {
    const id = await submitted("owner-b");
    expect(await claimForReview(as(null), id)).toEqual({ ok: false, reason: "unauthenticated" });
    expect(await claimForReview(as("plain"), id)).toEqual({ ok: false, reason: "forbidden" });
    expect(await claimForReview(as("owner-b"), id)).toEqual({ ok: false, reason: "forbidden" });
    expect(await claimForReview(as("mod-1"), "demo-listing-1")).toEqual({
      ok: false,
      reason: "not-found",
    });
    const plainDraft = await draft("owner-b");
    expect(await claimForReview(as("mod-1"), plainDraft)).toEqual({
      ok: false,
      reason: "conflict",
    });
    await addUser(db, "mod-own");
    await db.query("INSERT INTO user_roles (user_id, role) VALUES ('mod-own', 'moderator')");
    const own = await submitted("mod-own");
    expect(await claimForReview(as("mod-own"), own)).toEqual({ ok: false, reason: "own-listing" });
    expect(await claimForReview(as("mod-1"), id)).toEqual({ ok: true });
  });

  it("assigns a listing to exactly one of several simultaneous claimers", async () => {
    const id = await submitted();
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
      claimForReview(serial("mod-1"), id),
      claimForReview(serial("mod-2"), id),
    ]);
    expect(results.filter((r) => r.ok).length).toBe(1);
    expect(results.filter((r) => !r.ok).map((r) => !r.ok && r.reason)).toEqual(["claimed"]);
    const claim = await one<{ n: number }>(
      "SELECT count(*)::int AS n FROM listing_status_events WHERE listing_id = $1 AND kind = 'claim'",
      [id],
    );
    expect(claim.n).toBe(1);
  });

  it("sets the expiry from the database clock to CLAIM_MINUTES (same value in SQL)", async () => {
    const id = await submitted();
    expect(await claimForReview(as("mod-1"), id)).toEqual({ ok: true });
    const row = await one<{ seconds: number }>(
      "SELECT extract(epoch FROM review_claim_expires_at - clock_timestamp())::int AS seconds FROM listings WHERE id = $1",
      [id],
    );
    expect(row.seconds).toBeGreaterThan(CLAIM_MINUTES * 60 - 30);
    expect(row.seconds).toBeLessThanOrEqual(CLAIM_MINUTES * 60);
    const sql = readFileSync(
      join(
        __dirname,
        "..",
        "..",
        "..",
        "db",
        "migrations",
        "0006_review_assignments_notifications.sql",
      ),
      "utf8",
    );
    expect(sql).toContain(`interval '${CLAIM_MINUTES} minutes'`);
  });

  it("requires the holder's unexpired claim for decisions, and refuses stale ones", async () => {
    const id = await submitted();
    // No claim yet.
    expect(await moderate(as("mod-1"), id, "approve", null)).toEqual({
      ok: false,
      reason: "not-claimed",
    });
    expect(await claimForReview(as("mod-1"), id)).toEqual({ ok: true });
    // Another moderator can neither claim, decide nor release while the claim is active.
    expect(await claimForReview(as("mod-2"), id)).toEqual({ ok: false, reason: "claimed" });
    expect(await moderate(as("mod-2"), id, "approve", null)).toEqual({
      ok: false,
      reason: "claimed",
    });
    expect(await releaseReview(as("mod-2"), id)).toEqual({ ok: false, reason: "not-claimed" });
    expect(await releaseReview(as("plain"), id)).toEqual({ ok: false, reason: "forbidden" });
    // The database refuses a decision without the claim, even with a correct actor.
    expect(
      await tryAs("mod-2", "moderator", "UPDATE listings SET status = 'approved' WHERE id = $1", [
        id,
      ]),
    ).toBe(false);
    expect(lastError).toMatch(/needs an active claim/);

    // The claim expires: the old holder's decision is stale and refused...
    await expireClaim(id);
    expect(await moderate(as("mod-1"), id, "approve", null)).toEqual({
      ok: false,
      reason: "not-claimed",
    });
    expect(
      await tryAs("mod-1", "moderator", "UPDATE listings SET status = 'approved' WHERE id = $1", [
        id,
      ]),
    ).toBe(false);
    expect(lastError).toMatch(/needs an active claim/);
    // ...and another moderator may take it over.
    expect(await claimForReview(as("mod-2"), id)).toEqual({ ok: true });
    expect(await moderate(as("mod-1"), id, "approve", null)).toEqual({
      ok: false,
      reason: "claimed",
    });
    expect(await moderate(as("mod-2"), id, "approve", null)).toMatchObject({ ok: true });
    const row = await one<{ status: string; review_claimed_by: string | null }>(
      "SELECT status, review_claimed_by FROM listings WHERE id = $1",
      [id],
    );
    expect(row).toEqual({ status: "approved", review_claimed_by: null });
  });

  it("lets the holder release the claim, after which another moderator can claim", async () => {
    const id = await submitted();
    expect(await releaseReview(as("mod-1"), id)).toEqual({ ok: false, reason: "not-claimed" });
    expect(await claimForReview(as("mod-1"), id)).toEqual({ ok: true });
    expect(await releaseReview(as("mod-1"), id)).toEqual({ ok: true });
    expect(await claimForReview(as("mod-2"), id)).toEqual({ ok: true });
    const kinds = await db.query<{ kind: string; actor_user_id: string }>(
      "SELECT kind, actor_user_id FROM listing_status_events WHERE listing_id = $1 AND kind <> 'status' ORDER BY id",
      [id],
    );
    expect(kinds.rows).toEqual([
      { kind: "claim", actor_user_id: "mod-1" },
      { kind: "release", actor_user_id: "mod-1" },
      { kind: "claim", actor_user_id: "mod-2" },
    ]);
  });

  it("ends the claim when the owner withdraws, and refuses direct claim tricks", async () => {
    const id = await submitted();
    expect(await claimForReview(as("mod-1"), id)).toEqual({ ok: true });
    expect(await withdrawSubmission(as("owner-a"), id)).toEqual({ ok: true });
    const row = await one<{ review_claimed_by: string | null }>(
      "SELECT review_claimed_by FROM listings WHERE id = $1",
      [id],
    );
    expect(row.review_claimed_by).toBeNull();

    const other = await submitted();
    const claimFor = "UPDATE listings SET review_claimed_by = $2 WHERE id = $1";
    // No actor, an owner as actor, claiming for someone else, a non-moderator.
    expect(await tryAs(null, "moderator", claimFor, [other, "mod-1"])).toBe(false);
    expect(lastError).toMatch(/moderator as actor/);
    expect(await tryAs("owner-a", "owner", claimFor, [other, "owner-a"])).toBe(false);
    expect(lastError).toMatch(/moderator as actor/);
    expect(await tryAs("mod-1", "moderator", claimFor, [other, "mod-2"])).toBe(false);
    expect(lastError).toMatch(/only claim for themselves/);
    expect(await tryAs("plain", "moderator", claimFor, [other, "plain"])).toBe(false);
    expect(lastError).toMatch(/not a moderator/);
    // A claim on a draft, a claim with a status change, a hand-set expiry far in the future.
    const plain = await draft();
    expect(await tryAs("mod-1", "moderator", claimFor, [plain, "mod-1"])).toBe(false);
    expect(lastError).toMatch(/only submitted listings/);
    expect(
      await tryAs(
        "mod-1",
        "moderator",
        "UPDATE listings SET review_claimed_by = 'mod-1', status = 'approved' WHERE id = $1",
        [other],
      ),
    ).toBe(false);
    expect(lastError).toMatch(/only submitted listings/);
    await db.exec("BEGIN");
    await setActor(db, "mod-1", "moderator");
    await db.query(
      "UPDATE listings SET review_claimed_by = 'mod-1', review_claim_expires_at = now() + interval '30 days' WHERE id = $1",
      [other],
    );
    const forced = await one<{ seconds: number }>(
      "SELECT extract(epoch FROM review_claim_expires_at - clock_timestamp())::int AS seconds FROM listings WHERE id = $1",
      [other],
    );
    await db.exec("ROLLBACK");
    expect(forced.seconds).toBeLessThanOrEqual(CLAIM_MINUTES * 60);
  });

  it("shows claim state, resubmissions and the next listing in the queue", async () => {
    const first = await submitted("owner-b", { citySlug: "batumi", district: "ძველი ბათუმი" });
    const second = await submitted("owner-b", { citySlug: "batumi", district: "ძველი ბათუმი" });
    expect(await claimForReview(as("mod-2"), first)).toEqual({ ok: true });
    const queue = await moderationQueue(as("mod-1"), 1, { city: "batumi" });
    const entries = queue!.entries.filter((e) => e.id === first || e.id === second);
    expect(entries.map((e) => [e.id, e.claim.state, e.submissionNumber])).toEqual([
      [first, "other", 1],
      [second, "free", 1],
    ]);
    expect(queue!.entries.every((e) => e.city === "ბათუმი")).toBe(true);
    const own = await moderationQueue(as("mod-2"), 1, { city: "batumi" });
    expect(own!.entries.find((e) => e.id === first)!.claim.state).toBe("mine");
    // Next for mod-1 skips the listing another moderator holds.
    const details = await reviewDetails(as("mod-1"), second, { city: "batumi" });
    expect(details!.next).not.toBe(first);
    const houses = await moderationQueue(as("mod-1"), 1, { propertyType: "house" });
    expect(houses!.entries.some((e) => e.id === first || e.id === second)).toBe(false);
  });
});

describe("notifications", () => {
  it("are created with the decision, for the owner only, and roll back with it", async () => {
    const id = await submitted("owner-b");
    const before = await unreadForUser(as("owner-b"));
    expect(await claimForReview(as("mod-1"), id)).toEqual({ ok: true });
    // Claims and submissions notify nobody.
    expect(await unreadForUser(as("owner-b"))).toBe(before);

    // A decision that is rolled back leaves neither the status, the event nor a notification.
    await withTransaction(db, async () => {
      await setActor(db, "mod-1", "moderator", "fix the photos");
      await db.query("UPDATE listings SET status = 'changes_requested' WHERE id = $1", [id]);
      throw new Error("abort");
    }).catch(() => {});
    expect(await unreadForUser(as("owner-b"))).toBe(before);
    const events = await one<{ n: number }>(
      "SELECT count(*)::int AS n FROM listing_status_events WHERE listing_id = $1 AND kind = 'status' AND to_status = 'changes_requested'",
      [id],
    );
    expect(events.n).toBe(0);

    expect(await moderate(as("mod-1"), id, "request-changes", "ფოტო ბნელია")).toMatchObject({
      ok: true,
    });
    expect(await unreadForUser(as("owner-b"))).toBe(before + 1);
    const list = await notificationsForUser(as("owner-b"), 1);
    expect(list!.items[0]).toMatchObject({
      kind: "changes_requested",
      listingId: id,
      reason: "ფოტო ბნელია",
      read: false,
      listingAvailable: true,
    });
    // Nothing about the moderator is returned.
    expect(JSON.stringify(list)).not.toMatch(/mod-1|example\.com/);
    // Nobody else got it.
    expect(
      (await notificationsForUser(as("mod-1"), 1))!.items.some((n) => n.listingId === id),
    ).toBe(false);
  });

  it("can only be read and marked by their owner, and only as read", async () => {
    const id = await submitted("owner-a");
    expect(await claimForReview(as("mod-1"), id)).toEqual({ ok: true });
    expect(await moderate(as("mod-1"), id, "approve", null)).toMatchObject({ ok: true });
    const mine = (await notificationsForUser(as("owner-a"), 1))!.items.find(
      (n) => n.listingId === id,
    )!;
    expect(mine.kind).toBe("approved");
    // Another user cannot see or mark it.
    expect(
      (await notificationsForUser(as("owner-b"), 1))!.items.some((n) => n.id === mine.id),
    ).toBe(false);
    expect(await markNotificationRead(as("owner-b"), mine.id)).toBe(false);
    expect(await markNotificationRead(as(null), mine.id)).toBe(false);
    expect(await markNotificationRead(as("owner-a"), "nt-not-an-id")).toBe(false);
    expect(await notificationsForUser(as(null), 1)).toBeNull();
    const unread = await unreadForUser(as("owner-a"));
    expect(await markNotificationRead(as("owner-a"), mine.id)).toBe(true);
    expect(await unreadForUser(as("owner-a"))).toBe(unread - 1);
    expect(
      (await notificationsForUser(as("owner-a"), 1))!.items.find((n) => n.id === mine.id)!.read,
    ).toBe(true);
    expect(await markAllNotificationsRead(as("owner-a"))).toBe(true);
    expect(await unreadForUser(as("owner-a"))).toBe(0);
    // The database allows nothing but marking as read.
    await expect(
      db.query("UPDATE notifications SET read_at = NULL WHERE id = $1", [mine.id]),
    ).rejects.toThrow();
    await expect(
      db.query("UPDATE notifications SET user_id = 'owner-b' WHERE id = $1", [mine.id]),
    ).rejects.toThrow();
    await expect(
      db.query("UPDATE notifications SET kind = 'rejected' WHERE id = $1", [mine.id]),
    ).rejects.toThrow();
  });

  it("survive a restart and point to archived listings without a link", async () => {
    const id = await submitted("owner-b");
    expect(await claimForReview(as("mod-1"), id)).toEqual({ ok: true });
    expect(await moderate(as("mod-1"), id, "reject", "წესების დარღვევა")).toMatchObject({
      ok: true,
    });
    await withTransaction(db, async () => {
      await setActor(db, "owner-b", "owner");
      await db.query("UPDATE listings SET status = 'archived' WHERE id = $1", [id]);
    });
    const fresh: ReviewDeps = {
      currentUserId: async () => "owner-b",
      withConnection: (w) => w(db),
    };
    const item = (await notificationsForUser(fresh, 1))!.items.find((n) => n.listingId === id)!;
    expect(item).toMatchObject({ kind: "rejected", listingAvailable: false });
  });
});

describe("change tracking between submissions", () => {
  it("lists the changed fields, stores no values and cannot be altered", async () => {
    const id = await submitted("owner-a", { price: "145000" });
    let details = await reviewDetailsAs(id);
    expect(details.meta.submissionNumber).toBe(1);
    expect(details.meta.changes).toEqual({ kind: "first" });

    expect(await claimForReview(as("mod-1"), id)).toEqual({ ok: true });
    expect(await moderate(as("mod-1"), id, "request-changes", "ფასი")).toMatchObject({ ok: true });
    const save = await saveDraftForUser(as("owner-a"), sampleDraft({ price: "139500" }), id);
    expect(save.ok).toBe(true);
    expect((await uploadDraftPhoto(photosAs("owner-a"), id, await jpeg(25, 25))).ok).toBe(true);
    expect(await submitForReview(as("owner-a"), id)).toEqual({ ok: true });

    details = await reviewDetailsAs(id);
    expect(details.meta.submissionNumber).toBe(2);
    expect(details.meta.changes.kind).toBe("changed");
    const fields = details.meta.changes.kind === "changed" ? details.meta.changes.fields : [];
    expect(fields).toContain("price");
    expect(fields).toContain("photos");
    expect(fields).not.toContain("title");
    expect(fields).not.toContain("district");

    // Withdraw and resubmit without changes: nothing changed.
    expect(await withdrawSubmission(as("owner-a"), id)).toEqual({ ok: true });
    expect(await submitForReview(as("owner-a"), id)).toEqual({ ok: true });
    details = await reviewDetailsAs(id);
    expect(details.meta).toMatchObject({
      submissionNumber: 3,
      changes: { kind: "changed", fields: [] },
    });

    // Fingerprints only: no price, district or title text is stored.
    const stored = await db.query<{ fields: Record<string, string> }>(
      "SELECT fields FROM listing_submission_fingerprints WHERE listing_id = $1",
      [id],
    );
    expect(stored.rows.length).toBe(3);
    const text = JSON.stringify(stored.rows);
    expect(text).not.toMatch(/139500|145000|ვაკე/);
    for (const row of stored.rows) {
      for (const value of Object.values(row.fields)) expect(value).toMatch(/^[0-9a-f]{32}$/);
    }
    await expect(
      db.query(
        "UPDATE listing_submission_fingerprints SET changed_fields = NULL WHERE listing_id = $1",
        [id],
      ),
    ).rejects.toThrow();
    await expect(
      db.query("DELETE FROM listing_submission_fingerprints WHERE listing_id = $1", [id]),
    ).rejects.toThrow();
    await expect(db.exec("TRUNCATE listing_submission_fingerprints")).rejects.toThrow();
  });

  it("links each fingerprint to its own submission when event ids gain a digit", async () => {
    // Regression (found in the browser check): the latest event was once picked by sorting the
    // id as TEXT, so "999" came before "1001" and a resubmission failed.
    const id = await draft("owner-a");
    const { rows } = await db.query<{ next: string }>(
      "SELECT (10 ^ (length(coalesce(max(id), 1)::text) + 1) - 2)::bigint::text AS next FROM listing_status_events",
    );
    await db.query("SELECT setval(pg_get_serial_sequence('listing_status_events', 'id'), $1)", [
      rows[0].next,
    ]);
    expect(await submitForReview(as("owner-a"), id)).toEqual({ ok: true });
    expect(await withdrawSubmission(as("owner-a"), id)).toEqual({ ok: true });
    expect(await submitForReview(as("owner-a"), id)).toEqual({ ok: true });
    const linked = await db.query<{ ok: boolean }>(
      `SELECT f.event_id = (SELECT max(e.id) FROM listing_status_events e
         WHERE e.listing_id = f.listing_id AND e.kind = 'status' AND e.to_status = 'submitted'
           AND e.id <= f.event_id) AS ok
       FROM listing_submission_fingerprints f WHERE f.listing_id = $1 ORDER BY f.event_id`,
      [id],
    );
    expect(linked.rows).toEqual([{ ok: true }, { ok: true }]);
    expect((await reviewDetailsAs(id)).meta).toMatchObject({
      submissionNumber: 2,
      changes: { kind: "changed", fields: [] },
    });
  });
});

async function reviewDetailsAs(id: string) {
  const details = await reviewDetails(as("mod-2"), id);
  if (!details) throw new Error("not reviewable");
  return details;
}

describe("review history and audit", () => {
  it("is available to moderators only, filterable, and the audit stays immutable", async () => {
    const id = await submitted("owner-b");
    expect(await claimForReview(as("mod-1"), id)).toEqual({ ok: true });
    expect(await moderate(as("mod-1"), id, "approve", null)).toMatchObject({ ok: true });

    expect(await reviewHistory(as("plain"), {})).toBeNull();
    expect(await reviewHistory(as("owner-b"), {})).toBeNull();
    expect(await reviewHistory(as(null), {})).toBeNull();

    const all = await reviewHistory(as("mod-1"), {});
    const forListing = all!.entries.filter((e) => e.listingId === id);
    expect(forListing.map((e) => [e.kind, e.to, e.byMe])).toEqual([
      ["status", "approved", true],
      ["claim", "submitted", true],
      ["status", "submitted", false],
    ]);
    expect(JSON.stringify(all)).not.toMatch(/example\.com|mod-1|owner-b/);

    const approved = await reviewHistory(as("mod-2"), { filter: "approved" });
    expect(approved!.entries.every((e) => e.kind === "status" && e.to === "approved")).toBe(true);
    expect(approved!.entries.find((e) => e.listingId === id)!.byMe).toBe(false);
    const assignments = await reviewHistory(as("mod-2"), { filter: "assignments" });
    expect(assignments!.entries.every((e) => e.kind !== "status")).toBe(true);
    const future = await reviewHistory(as("mod-2"), { from: "2999-01-01" });
    expect(future!.total).toBe(0);
    const bad = await reviewHistory(as("mod-2"), { from: "2026-13-45", filter: "drop", page: -1 });
    expect(bad).toMatchObject({ from: null, filter: null, page: 1 });

    await expect(
      db.query("UPDATE listing_status_events SET kind = 'status' WHERE listing_id = $1", [id]),
    ).rejects.toThrow();
    await expect(
      db.query("DELETE FROM listing_status_events WHERE listing_id = $1", [id]),
    ).rejects.toThrow();
    // A claim event must look like one.
    await expect(
      db.query(
        `INSERT INTO listing_status_events (listing_id, from_status, to_status, actor_user_id,
           actor_role, kind) VALUES ($1, 'submitted', 'approved', 'mod-1', 'moderator', 'claim')`,
        [id],
      ),
    ).rejects.toThrow();
  });
});

describe("privacy stays as before", () => {
  it("keeps claimed and decided listings and their photos out of public data", async () => {
    const claimed = await submitted("owner-b");
    expect(await claimForReview(as("mod-1"), claimed)).toEqual({ ok: true });
    const approved = await submitted("owner-b");
    expect(await claimForReview(as("mod-1"), approved)).toEqual({ ok: true });
    expect(await moderate(as("mod-1"), approved, "approve", null)).toMatchObject({ ok: true });
    const repository = createPostgresRepository(db);
    const allIds = await repository.getListingIds();
    for (const id of [claimed, approved]) {
      expect(allIds).not.toContain(id);
      expect(await repository.getListingById(id)).toBeNull();
      expect(await repository.getListingImages(id)).toEqual([]);
    }
    const photo = (await ownerListingView(as("owner-b"), approved))!.photos[0].id;
    expect(await readDraftPhoto(photosAs("mod-1"), approved, photo)).toBeNull();
    expect(await readDraftPhoto(photosAs("plain"), approved, photo)).toBeNull();
    expect(await readDraftPhoto(photosAs("owner-b"), approved, photo)).not.toBeNull();
    const claimedPhoto = (await ownerListingView(as("owner-b"), claimed))!.photos[0].id;
    expect(await readDraftPhoto(photosAs("mod-2"), claimed, claimedPhoto)).not.toBeNull();
    expect(await readDraftPhoto(photosAs("owner-a"), claimed, claimedPhoto)).toBeNull();
  });
});
