import { draftToRecords, recordsToDraft } from "@/lib/drafts/draft-input";
import { getOwnedListing, getSubmittedListing, setActor } from "@/lib/drafts/draft-store";
import { type SqlClient, type SqlConnection, withTransaction } from "@/lib/db/sql-client";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import type { UserListingStatus } from "@/lib/review/statuses";

/*
 * Submission and moderation in PostgreSQL. Every change runs in a transaction that locks the
 * listing row (SELECT ... FOR UPDATE), re-checks owner/role/status under the lock, states the
 * actor for the database triggers (migration 0005) and changes the status; the triggers check the
 * transition once more and write the audit row. Two simultaneous decisions on one listing are
 * serialized by the lock: the second one finds the status already changed and is refused.
 */

export type StatusEvent = {
  from: UserListingStatus;
  to: UserListingStatus;
  actorRole: "owner" | "moderator";
  reason: string | null;
  at: string;
};

export type QueueEntry = {
  id: string;
  title: string;
  transactionType: string;
  propertyType: string;
  city: string;
  district: string;
  amount: number;
  currency: string;
  submittedAt: string;
  photoCount: number;
};

export type OwnerTransitionResult = "ok" | "not-found" | "conflict" | "incomplete" | "no-photo";

export type DecisionResult = "ok" | "not-found" | "conflict" | "forbidden" | "own-listing";

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS"Z"'`;

export async function isModerator(db: SqlClient, userId: string): Promise<boolean> {
  const { rows } = await db.query(
    "SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'moderator'",
    [userId],
  );
  return rows.length === 1;
}

async function lockOwned(db: SqlClient, ownerId: string, listingId: string) {
  const { rows } = await db.query<{ status: UserListingStatus }>(
    `SELECT status FROM listings
     WHERE id = $1 AND owner_user_id = $2 AND data_source = 'user' FOR UPDATE`,
    [listingId, ownerId],
  );
  return rows[0]?.status ?? null;
}

async function photoCount(db: SqlClient, listingId: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM listing_images WHERE listing_id = $1 AND source_kind = 'upload'",
    [listingId],
  );
  return rows[0].n;
}

/** The stored listing passes the same complete validation as saving it from the form. */
export function isCompleteListing(item: ListingWithProperty): boolean {
  return draftToRecords(recordsToDraft(item)).ok;
}

/**
 * Owner submits a draft (or a listing with requested changes) for review. Requires a complete
 * listing and at least one stored photo; a second submit finds it already submitted ("conflict").
 */
export async function submitListing(
  db: SqlConnection,
  ownerId: string,
  listingId: string,
): Promise<OwnerTransitionResult> {
  return withTransaction(db, async () => {
    const status = await lockOwned(db, ownerId, listingId);
    if (status === null || status === "archived") return "not-found";
    if (status !== "draft" && status !== "changes_requested") return "conflict";
    const item = await getOwnedListing(db, ownerId, listingId);
    if (!item || !isCompleteListing(item)) return "incomplete";
    if ((await photoCount(db, listingId)) < 1) return "no-photo";
    await setActor(db, ownerId, "owner");
    await db.query("UPDATE listings SET status = 'submitted', updated_at = now() WHERE id = $1", [
      listingId,
    ]);
    return "ok";
  });
}

/** Owner withdraws a submission before any decision; it becomes an editable draft again. */
export async function withdrawListing(
  db: SqlConnection,
  ownerId: string,
  listingId: string,
): Promise<OwnerTransitionResult> {
  return withTransaction(db, async () => {
    const status = await lockOwned(db, ownerId, listingId);
    if (status === null || status === "archived") return "not-found";
    if (status !== "submitted") return "conflict";
    await setActor(db, ownerId, "owner");
    await db.query("UPDATE listings SET status = 'draft', updated_at = now() WHERE id = $1", [
      listingId,
    ]);
    return "ok";
  });
}

/** A moderator's decision on a submitted listing of another user. */
export async function decide(
  db: SqlConnection,
  moderatorId: string,
  listingId: string,
  to: "approved" | "changes_requested" | "rejected",
  reason: string | null,
): Promise<DecisionResult> {
  return withTransaction(db, async () => {
    if (!(await isModerator(db, moderatorId))) return "forbidden";
    const { rows } = await db.query<{ status: UserListingStatus; owner_user_id: string }>(
      `SELECT status, owner_user_id FROM listings
       WHERE id = $1 AND data_source = 'user' AND status <> 'archived' FOR UPDATE`,
      [listingId],
    );
    const row = rows[0];
    if (!row) return "not-found";
    if (row.owner_user_id === moderatorId) return "own-listing";
    if (row.status !== "submitted") return "conflict";
    await setActor(db, moderatorId, "moderator", reason);
    await db.query("UPDATE listings SET status = $2, updated_at = now() WHERE id = $1", [
      listingId,
      to,
    ]);
    return "ok";
  });
}

/** Submitted listings of other users, oldest submission first. */
export async function listQueue(
  db: SqlClient,
  moderatorId: string,
  page: number,
  pageSize: number,
): Promise<{ entries: QueueEntry[]; total: number }> {
  const { rows } = await db.query<{
    id: string;
    title: string;
    transaction_type: string;
    property_type: string;
    city: string;
    district: string;
    amount: string;
    currency: string;
    submitted_at: string;
    photo_count: number;
    total: number;
  }>(
    `SELECT l.id, l.title, l.transaction_type, p.type AS property_type, c.name AS city, p.district,
            l.asking_amount::text AS amount, l.asking_currency AS currency,
            to_char(l.submitted_at AT TIME ZONE 'UTC', ${ISO}) AS submitted_at,
            (SELECT count(*)::int FROM listing_images i
              WHERE i.listing_id = l.id AND i.source_kind = 'upload') AS photo_count,
            count(*) OVER ()::int AS total
     FROM listings l JOIN properties p ON p.id = l.property_id JOIN cities c ON c.slug = p.city_slug
     WHERE l.data_source = 'user' AND l.status = 'submitted' AND l.owner_user_id <> $1
     ORDER BY l.submitted_at, l.id
     LIMIT $2 OFFSET $3`,
    [moderatorId, pageSize, (page - 1) * pageSize],
  );
  let total = rows[0]?.total ?? 0;
  if (rows.length === 0 && page > 1) {
    const counted = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM listings
       WHERE data_source = 'user' AND status = 'submitted' AND owner_user_id <> $1`,
      [moderatorId],
    );
    total = counted.rows[0].n;
  }
  return {
    total,
    entries: rows.map((row) => ({
      id: row.id,
      title: row.title,
      transactionType: row.transaction_type,
      propertyType: row.property_type,
      city: row.city,
      district: row.district,
      amount: Number(row.amount),
      currency: row.currency,
      submittedAt: row.submitted_at,
      photoCount: row.photo_count,
    })),
  };
}

/** A submitted listing for review by a moderator who is not its owner, or null. */
export async function getForReview(
  db: SqlClient,
  moderatorId: string,
  listingId: string,
): Promise<ListingWithProperty | null> {
  if (!(await isModerator(db, moderatorId))) return null;
  const item = await getSubmittedListing(db, listingId);
  if (!item) return null;
  const { rows } = await db.query<{ owner: string }>(
    "SELECT owner_user_id AS owner FROM listings WHERE id = $1",
    [listingId],
  );
  return rows[0]?.owner === moderatorId ? null : item;
}

/** Status history of a listing (no actor identities, only the role). */
export async function statusHistory(db: SqlClient, listingId: string): Promise<StatusEvent[]> {
  const { rows } = await db.query<{
    from_status: UserListingStatus;
    to_status: UserListingStatus;
    actor_role: "owner" | "moderator";
    reason: string | null;
    at: string;
  }>(
    `SELECT from_status, to_status, actor_role, reason,
            to_char(created_at AT TIME ZONE 'UTC', ${ISO}) AS at
     FROM listing_status_events WHERE listing_id = $1 ORDER BY id`,
    [listingId],
  );
  return rows.map((row) => ({
    from: row.from_status,
    to: row.to_status,
    actorRole: row.actor_role,
    reason: row.reason,
    at: row.at,
  }));
}

/** The current status of one of the owner's listings (not archived), or null. */
export async function ownedStatus(
  db: SqlClient,
  ownerId: string,
  listingId: string,
): Promise<UserListingStatus | null> {
  const { rows } = await db.query<{ status: UserListingStatus }>(
    `SELECT status FROM listings
     WHERE id = $1 AND owner_user_id = $2 AND data_source = 'user' AND status <> 'archived'`,
    [listingId, ownerId],
  );
  return rows[0]?.status ?? null;
}
