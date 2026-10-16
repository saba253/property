import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { createPostgresRepository } from "@/lib/db/postgres-repository";
import { seedDemoData } from "@/lib/db/seed-demo";
import { draftToRecords } from "@/lib/drafts/draft-input";
import { createDraft, setActor } from "@/lib/drafts/draft-store";
import { notificationsForUser } from "@/lib/notifications/notification-service";
import { uploadDraftPhoto } from "@/lib/photos/photo-service";
import {
  type ReviewDeps,
  SELF_APPROVAL_CONFIRMATION,
  adminOwnSubmitted,
  claimForReview,
  currentUserIsAdmin,
  moderate,
  reviewDetails,
  selfApproveListing,
  submitForReview,
} from "@/lib/review/review-service";
import { type TestDatabase, createTestDatabase } from "../db/test-database";
import { addUser, sampleDraft } from "../drafts/draft-fixtures";
import { jpeg, photoDepsFor, tempStorage } from "../photos/photo-fixtures";

// Owner-administrator workflow (migration 0007) on PGlite. Synthetic users and listings only.

let db: TestDatabase;
let temp: Awaited<ReturnType<typeof tempStorage>>;
beforeAll(async () => {
  db = await createTestDatabase();
  await seedDemoData(db);
  for (const id of ["admin", "admin-only", "mod-1", "mod-2", "owner-a", "plain"]) {
    await addUser(db, id);
  }
  await db.query(
    `INSERT INTO user_roles (user_id, role) VALUES ('admin', 'moderator'), ('admin', 'admin'),
       ('admin-only', 'admin'), ('mod-1', 'moderator'), ('mod-2', 'moderator')`,
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

async function submitted(owner: string) {
  const records = draftToRecords(sampleDraft());
  if (!records.ok) throw new Error("sample draft is invalid");
  const id = await createDraft(db, owner, records.item);
  const uploaded = await uploadDraftPhoto(photoDepsFor(db, owner, temp.storage), id, await jpeg());
  if (!uploaded.ok) throw new Error(uploaded.reason);
  expect(await submitForReview(as(owner), id)).toEqual({ ok: true });
  return id;
}

async function events(id: string) {
  const { rows } = await db.query<{ kind: string; to: string; role: string; actor: string }>(
    `SELECT kind, to_status AS to, actor_role AS role, actor_user_id AS actor
     FROM listing_status_events WHERE listing_id = $1 AND NOT (kind = 'status' AND actor_role = 'owner')
     ORDER BY id`,
    [id],
  );
  return rows;
}

async function statusOf(id: string) {
  const { rows } = await db.query<{ status: string; claimed: string | null }>(
    "SELECT status, review_claimed_by AS claimed FROM listings WHERE id = $1",
    [id],
  );
  return rows[0];
}

let lastError = "";
async function tryAs(actor: string, role: string, sql: string, params: unknown[]) {
  await db.exec("BEGIN");
  try {
    await setActor(db, actor, role as "owner", null);
    await db.query(sql, params);
    return true;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    return false;
  } finally {
    await db.exec("ROLLBACK");
  }
}

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

describe("administrator role", () => {
  it("needs both the admin and the moderator role, and only known roles exist", async () => {
    expect(await currentUserIsAdmin(as("admin"))).toBe(true);
    expect(await currentUserIsAdmin(as("admin-only"))).toBe(false);
    expect(await currentUserIsAdmin(as("mod-1"))).toBe(false);
    expect(await currentUserIsAdmin(as(null))).toBe(false);
    await expect(
      db.query("INSERT INTO user_roles (user_id, role) VALUES ('plain', 'superadmin')"),
    ).rejects.toThrow();
  });
});

describe("A: administrator decisions without a manual claim", () => {
  it("claims and decides in one step, recorded as claim + decision, with a notification", async () => {
    const id = await submitted("owner-a");
    expect((await reviewDetails(as("admin"), id))!.admin).toBe(true);
    expect(await moderate(as("admin"), id, "approve", null)).toMatchObject({ ok: true });
    expect(await statusOf(id)).toEqual({ status: "approved", claimed: null });
    expect(await events(id)).toEqual([
      { kind: "claim", to: "submitted", role: "moderator", actor: "admin" },
      { kind: "status", to: "approved", role: "moderator", actor: "admin" },
    ]);
    const notes = await notificationsForUser(as("owner-a"), 1);
    expect(notes!.items.some((n) => n.listingId === id && n.kind === "approved")).toBe(true);
  });

  it("keeps the claim requirement for ordinary moderators", async () => {
    const id = await submitted("owner-a");
    expect(await moderate(as("mod-1"), id, "approve", null)).toEqual({
      ok: false,
      reason: "not-claimed",
    });
    // An admin row without the moderator role gives no privileges at all.
    expect(await moderate(as("admin-only"), id, "approve", null)).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect((await statusOf(id)).status).toBe("submitted");
  });

  it("respects another moderator's active claim and takes over only after it expires", async () => {
    const id = await submitted("owner-a");
    expect(await claimForReview(as("mod-1"), id)).toEqual({ ok: true });
    expect(await moderate(as("admin"), id, "reject", "duplicate")).toEqual({
      ok: false,
      reason: "claimed",
    });
    expect(await statusOf(id)).toEqual({ status: "submitted", claimed: "mod-1" });
    await expireClaim(id);
    expect(await moderate(as("admin"), id, "request-changes", "ფოტო")).toMatchObject({
      ok: true,
    });
    expect((await statusOf(id)).status).toBe("changes_requested");
  });

  it("never decides on the administrator's own listing through the moderator path", async () => {
    const id = await submitted("admin");
    expect(await moderate(as("admin"), id, "approve", null)).toEqual({
      ok: false,
      reason: "own-listing",
    });
    expect(
      await tryAs("admin", "moderator", "UPDATE listings SET status = 'approved' WHERE id = $1", [
        id,
      ]),
    ).toBe(false);
    expect(await reviewDetails(as("admin"), id)).toBeNull();
  });

  it("serializes an administrator decision and a moderator claim (one wins)", async () => {
    const id = await submitted("owner-a");
    let chain: Promise<unknown> = Promise.resolve();
    const serial = (userId: string): ReviewDeps => ({
      ...as(userId),
      withConnection: (work) => {
        const run = chain.then(() => work(db));
        chain = run.catch(() => {});
        return run;
      },
    });
    const [claim, decision] = await Promise.all([
      claimForReview(serial("mod-2"), id),
      moderate(serial("admin"), id, "approve", null),
    ]);
    expect([claim.ok, decision.ok].filter(Boolean).length).toBe(1);
    const row = await statusOf(id);
    expect(row.status === "approved" ? decision.ok : claim.ok).toBe(true);
  });
});

describe("B: administrator self-approval", () => {
  it("approves the administrator's own listing only with the explicit confirmation", async () => {
    const id = await submitted("admin");
    expect((await adminOwnSubmitted(as("admin")))!.some((l) => l.id === id)).toBe(true);
    expect(await adminOwnSubmitted(as("mod-1"))).toBeNull();
    for (const confirmation of [undefined, null, true, "yes", ""]) {
      expect(await selfApproveListing(as("admin"), id, confirmation)).toEqual({
        ok: false,
        reason: "confirmation-required",
      });
    }
    expect((await statusOf(id)).status).toBe("submitted");
    const before = (await notificationsForUser(as("admin"), 1))!.total;
    expect(
      await selfApproveListing(as("admin"), id, SELF_APPROVAL_CONFIRMATION, "შევამოწმე"),
    ).toEqual({ ok: true });
    expect(await statusOf(id)).toEqual({ status: "approved", claimed: null });
    // Recorded distinctly, with the note; no notification to oneself.
    const { rows } = await db.query<{ role: string; reason: string | null; from: string }>(
      `SELECT actor_role AS role, reason, from_status AS from FROM listing_status_events
       WHERE listing_id = $1 AND to_status = 'approved'`,
      [id],
    );
    expect(rows).toEqual([{ role: "admin", reason: "შევამოწმე", from: "submitted" }]);
    expect((await notificationsForUser(as("admin"), 1))!.total).toBe(before);
    // Twice is a conflict; the audit row cannot be changed.
    expect(await selfApproveListing(as("admin"), id, SELF_APPROVAL_CONFIRMATION)).toEqual({
      ok: false,
      reason: "conflict",
    });
    await expect(
      db.query(
        "UPDATE listing_status_events SET actor_role = 'moderator' WHERE listing_id = $1 AND actor_role = 'admin'",
        [id],
      ),
    ).rejects.toThrow();
    // Approved is still private.
    expect(await createPostgresRepository(db).getListingById(id)).toBeNull();
  });

  it("is refused for anyone else, for other users' listings and for other transitions", async () => {
    const own = await submitted("mod-1");
    // Ordinary moderators cannot approve their own listings, in the app or in SQL.
    expect(await selfApproveListing(as("mod-1"), own, SELF_APPROVAL_CONFIRMATION)).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(
      await tryAs("mod-1", "admin", "UPDATE listings SET status = 'approved' WHERE id = $1", [own]),
    ).toBe(false);
    expect(lastError).toMatch(/not an administrator/);
    const adminOnly = await submitted("admin-only");
    expect(
      await selfApproveListing(as("admin-only"), adminOnly, SELF_APPROVAL_CONFIRMATION),
    ).toEqual({ ok: false, reason: "forbidden" });
    expect(
      await tryAs("admin-only", "admin", "UPDATE listings SET status = 'approved' WHERE id = $1", [
        adminOnly,
      ]),
    ).toBe(false);
    // Self-approval is only for the administrator's own listings.
    const foreign = await submitted("owner-a");
    expect(await selfApproveListing(as("admin"), foreign, SELF_APPROVAL_CONFIRMATION)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(
      await tryAs("admin", "admin", "UPDATE listings SET status = 'approved' WHERE id = $1", [
        foreign,
      ]),
    ).toBe(false);
    expect(lastError).toMatch(/own listings/);
    // Only submitted -> approved.
    const mine = await submitted("admin");
    for (const to of ["rejected", "changes_requested", "draft", "archived"]) {
      expect(
        await tryAs("admin", "admin", "UPDATE listings SET status = $2 WHERE id = $1", [mine, to]),
        to,
      ).toBe(false);
    }
    // The audit table accepts 'admin' only for a self-approval.
    await expect(
      db.query(
        `INSERT INTO listing_status_events (listing_id, from_status, to_status, actor_user_id,
           actor_role, reason) VALUES ($1, 'submitted', 'rejected', 'admin', 'admin', 'x')`,
        [mine],
      ),
    ).rejects.toThrow();
    expect(await selfApproveListing(as(null), mine, SELF_APPROVAL_CONFIRMATION)).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
  });

  it("waits for a moderator who holds an active claim on the administrator's listing", async () => {
    const id = await submitted("admin");
    expect(await claimForReview(as("mod-2"), id)).toEqual({ ok: true });
    expect(await selfApproveListing(as("admin"), id, SELF_APPROVAL_CONFIRMATION)).toEqual({
      ok: false,
      reason: "claimed",
    });
    expect(
      await tryAs("admin", "admin", "UPDATE listings SET status = 'approved' WHERE id = $1", [id]),
    ).toBe(false);
    expect(lastError).toMatch(/claimed by a moderator/);
    await expireClaim(id);
    expect(await selfApproveListing(as("admin"), id, SELF_APPROVAL_CONFIRMATION)).toEqual({
      ok: true,
    });
    expect(await statusOf(id)).toEqual({ status: "approved", claimed: null });
  });
});
