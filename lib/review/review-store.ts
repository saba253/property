import { draftToRecords, recordsToDraft } from "@/lib/drafts/draft-input";
import { getOwnedListing, getSubmittedListing, setActor } from "@/lib/drafts/draft-store";
import { type SqlClient, type SqlConnection, withTransaction } from "@/lib/db/sql-client";
import { photosOf } from "@/lib/photos/photo-store";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import type { PropertyType } from "@/lib/properties/types";
import { type ChangeField, isChangeField } from "@/lib/review/changes";
import {
  type Fingerprints,
  changedFields,
  comparableFields,
  fingerprint,
} from "@/lib/review/fingerprints";
import type { UserListingStatus } from "@/lib/review/statuses";

/*
 * Submission and moderation in PostgreSQL. Every change runs in a transaction that locks the
 * listing row (SELECT ... FOR UPDATE), re-checks owner/role/status under the lock, states the
 * actor for the database triggers (migrations 0005, 0006) and changes the row; the triggers check
 * everything once more and write the audit row. Two simultaneous changes of one listing are
 * serialized by the lock: the second one finds the new state and is refused.
 *
 * Claims (0006): a moderator claims a submitted listing for CLAIM_MINUTES; only the holder of an
 * unexpired claim may decide; the holder may release it; after expiry anyone else may claim it.
 * Expiry is always compared with the database clock (clock_timestamp()), never the web server's.
 *
 * Owner-administrator (0007): an admin (roles 'admin' AND 'moderator') decides on other users'
 * listings without a separate claim step: the claim is taken in the decision's transaction
 * (still refused while another moderator holds an unexpired claim). An admin may also approve
 * their own submitted listing through the separate self-approval (actor role 'admin').
 */

export type StatusEvent = {
  kind: "status" | "claim" | "release";
  from: UserListingStatus;
  to: UserListingStatus;
  /** 'admin' only for an administrator's self-approval. */
  actorRole: "owner" | "moderator" | "admin";
  reason: string | null;
  at: string;
};

/** Claim state as one moderator sees it (never who else holds the claim). */
export type ClaimState =
  | { state: "free" }
  | { state: "mine"; secondsLeft: number }
  | { state: "other"; secondsLeft: number };

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
  /** 1 for a first submission, 2 and more for resubmissions. */
  submissionNumber: number;
  claim: ClaimState;
};

export type QueueFilters = { city?: string; propertyType?: PropertyType };

/** What changed since the previous submission (field names only). */
export type ChangeSummary =
  { kind: "first" } | { kind: "unknown" } | { kind: "changed"; fields: ChangeField[] };

export type ReviewMeta = {
  claim: ClaimState;
  submissionNumber: number;
  changes: ChangeSummary;
};

export type OwnerTransitionResult = "ok" | "not-found" | "conflict" | "incomplete" | "no-photo";

export type DecisionResult =
  "ok" | "not-found" | "conflict" | "forbidden" | "own-listing" | "claimed" | "not-claimed";

export type ClaimResult = "ok" | "not-found" | "conflict" | "forbidden" | "own-listing" | "claimed";
export type ReleaseResult = "ok" | "not-found" | "forbidden" | "not-claimed";
export type SelfApprovalResult = "ok" | "not-found" | "forbidden" | "conflict" | "claimed";

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS"Z"'`;

/** Seconds until the claim expires, by the database clock (NULL without a claim). */
const SECONDS_LEFT = `CASE WHEN l.review_claimed_by IS NULL THEN NULL
  ELSE greatest(0, floor(extract(epoch FROM l.review_claim_expires_at - clock_timestamp())))::int
  END`;

function claimOf(
  moderatorId: string,
  claimedBy: string | null,
  secondsLeft: number | null,
): ClaimState {
  if (!claimedBy || secondsLeft === null || secondsLeft <= 0) return { state: "free" };
  return { state: claimedBy === moderatorId ? "mine" : "other", secondsLeft };
}

export async function isModerator(db: SqlClient, userId: string): Promise<boolean> {
  const { rows } = await db.query(
    "SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'moderator'",
    [userId],
  );
  return rows.length === 1;
}

/** Administrator: both the 'admin' and the 'moderator' role (the database checks the same). */
export async function isAdmin(db: SqlClient, userId: string): Promise<boolean> {
  const { rows } = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM user_roles WHERE user_id = $1 AND role IN ('admin', 'moderator')",
    [userId],
  );
  return rows[0].n === 2;
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
 * The field fingerprints of this submission are stored in the same transaction.
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
    await recordFingerprints(db, item);
    return "ok";
  });
}

/**
 * Stores the fingerprints of the submission just made (lib/review/fingerprints.ts: no values, no
 * image bytes) and the fields changed since the previous fingerprinted submission.
 */
async function recordFingerprints(db: SqlClient, item: ListingWithProperty) {
  const listingId = item.listing.id;
  const current = fingerprint(
    listingId,
    comparableFields(recordsToDraft(item), await photosOf(db, listingId)),
  );
  // The event the trigger just wrote. Ordered by the numeric column (e.id), never by its text.
  const { rows: events } = await db.query<{ event_id: string }>(
    `SELECT e.id::text AS event_id FROM listing_status_events e
     WHERE e.listing_id = $1 AND e.kind = 'status' AND e.to_status = 'submitted'
     ORDER BY e.id DESC LIMIT 1`,
    [listingId],
  );
  const { rows: previous } = await db.query<{ fields: Partial<Fingerprints> }>(
    `SELECT fields FROM listing_submission_fingerprints WHERE listing_id = $1
     ORDER BY event_id DESC LIMIT 1`,
    [listingId],
  );
  await db.query(
    `INSERT INTO listing_submission_fingerprints (event_id, listing_id, fields, changed_fields)
     VALUES ($1, $2, $3, $4)`,
    [
      events[0].event_id,
      listingId,
      JSON.stringify(current),
      previous[0] ? changedFields(previous[0].fields, current) : null,
    ],
  );
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

type LockedForModerator = {
  status: UserListingStatus;
  owner_user_id: string;
  review_claimed_by: string | null;
  seconds_left: number | null;
};

async function lockForModerator(
  db: SqlClient,
  listingId: string,
): Promise<LockedForModerator | null> {
  const { rows } = await db.query<LockedForModerator>(
    `SELECT l.status, l.owner_user_id, l.review_claimed_by, ${SECONDS_LEFT} AS seconds_left
     FROM listings l
     WHERE l.id = $1 AND l.data_source = 'user' AND l.status <> 'archived' FOR UPDATE`,
    [listingId],
  );
  return rows[0] ?? null;
}

/**
 * A moderator claims a submitted listing of another user for CLAIM_MINUTES, or renews their own
 * claim. Refused while another moderator holds an unexpired claim. Recorded as a 'claim' event.
 */
export async function claimListing(
  db: SqlConnection,
  moderatorId: string,
  listingId: string,
): Promise<ClaimResult> {
  return withTransaction(db, async () => {
    if (!(await isModerator(db, moderatorId))) return "forbidden";
    const row = await lockForModerator(db, listingId);
    if (!row) return "not-found";
    if (row.owner_user_id === moderatorId) return "own-listing";
    if (row.status !== "submitted") return "conflict";
    if (claimOf(moderatorId, row.review_claimed_by, row.seconds_left).state === "other") {
      return "claimed";
    }
    await setActor(db, moderatorId, "moderator");
    // The trigger sets the expiry from the database clock and writes the audit row.
    await db.query("UPDATE listings SET review_claimed_by = $2 WHERE id = $1", [
      listingId,
      moderatorId,
    ]);
    return "ok";
  });
}

/** The holder releases their claim (also an expired one). Recorded as a 'release' event. */
export async function releaseClaim(
  db: SqlConnection,
  moderatorId: string,
  listingId: string,
): Promise<ReleaseResult> {
  return withTransaction(db, async () => {
    if (!(await isModerator(db, moderatorId))) return "forbidden";
    const row = await lockForModerator(db, listingId);
    if (!row || row.status !== "submitted" || row.owner_user_id === moderatorId) {
      return "not-found";
    }
    if (row.review_claimed_by !== moderatorId) return "not-claimed";
    await setActor(db, moderatorId, "moderator");
    await db.query("UPDATE listings SET review_claimed_by = NULL WHERE id = $1", [listingId]);
    return "ok";
  });
}

/**
 * A moderator's decision on a submitted listing of another user. Requires the moderator's own
 * unexpired claim; an expired claim ("not-claimed") cannot complete a stale decision. The
 * database trigger also writes the owner's notification in this transaction.
 */
export async function decide(
  db: SqlConnection,
  moderatorId: string,
  listingId: string,
  to: "approved" | "changes_requested" | "rejected",
  reason: string | null,
): Promise<DecisionResult> {
  return withTransaction(db, async () => {
    if (!(await isModerator(db, moderatorId))) return "forbidden";
    const row = await lockForModerator(db, listingId);
    if (!row) return "not-found";
    if (row.owner_user_id === moderatorId) return "own-listing";
    if (row.status !== "submitted") return "conflict";
    const claim = claimOf(moderatorId, row.review_claimed_by, row.seconds_left);
    if (claim.state === "other") return "claimed";
    if (claim.state !== "mine") {
      // Ordinary moderators claim first; an administrator's claim is taken here, in the same
      // transaction (the claim trigger records it), so a single admin needs no extra step.
      if (!(await isAdmin(db, moderatorId))) return "not-claimed";
      await setActor(db, moderatorId, "moderator");
      await db.query("UPDATE listings SET review_claimed_by = $2 WHERE id = $1", [
        listingId,
        moderatorId,
      ]);
    }
    await setActor(db, moderatorId, "moderator", reason);
    await db.query("UPDATE listings SET status = $2, updated_at = now() WHERE id = $1", [
      listingId,
      to,
    ]);
    return "ok";
  });
}

/**
 * An administrator approves their OWN submitted listing (explicit, separate action). Refused
 * while another moderator holds an unexpired claim. Recorded with actor role 'admin'; no
 * notification (the owner is the actor). Never automatic: callers require a confirmation.
 */
export async function selfApprove(
  db: SqlConnection,
  adminId: string,
  listingId: string,
  note: string | null,
): Promise<SelfApprovalResult> {
  return withTransaction(db, async () => {
    if (!(await isAdmin(db, adminId))) return "forbidden";
    const row = await lockForModerator(db, listingId);
    if (!row || row.owner_user_id !== adminId) return "not-found";
    if (row.status !== "submitted") return "conflict";
    if (claimOf(adminId, row.review_claimed_by, row.seconds_left).state !== "free") {
      return "claimed";
    }
    await setActor(db, adminId, "admin", note);
    await db.query("UPDATE listings SET status = 'approved', updated_at = now() WHERE id = $1", [
      listingId,
    ]);
    return "ok";
  });
}

/** The administrator's own submitted listings (for self-approval), oldest first. */
export async function ownSubmitted(
  db: SqlClient,
  adminId: string,
): Promise<{ id: string; title: string; submittedAt: string; claimedByOther: boolean }[]> {
  const { rows } = await db.query<{
    id: string;
    title: string;
    submitted_at: string;
    seconds_left: number | null;
  }>(
    `SELECT l.id, l.title, to_char(l.submitted_at AT TIME ZONE 'UTC', ${ISO}) AS submitted_at,
            ${SECONDS_LEFT} AS seconds_left
     FROM listings l
     WHERE l.owner_user_id = $1 AND l.data_source = 'user' AND l.status = 'submitted'
     ORDER BY l.submitted_at, l.id LIMIT 50`,
    [adminId],
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    submittedAt: row.submitted_at,
    claimedByOther: (row.seconds_left ?? 0) > 0,
  }));
}

const QUEUE_WHERE = `l.data_source = 'user' AND l.status = 'submitted' AND l.owner_user_id <> $1
  AND ($2::text IS NULL OR p.city_slug = $2) AND ($3::text IS NULL OR p.type = $3)`;

/** Submitted listings of other users, oldest submission first, optionally filtered. */
export async function listQueue(
  db: SqlClient,
  moderatorId: string,
  page: number,
  pageSize: number,
  filters: QueueFilters = {},
): Promise<{ entries: QueueEntry[]; total: number }> {
  const base = [moderatorId, filters.city ?? null, filters.propertyType ?? null];
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
    submission_number: number;
    review_claimed_by: string | null;
    seconds_left: number | null;
    total: number;
  }>(
    `SELECT l.id, l.title, l.transaction_type, p.type AS property_type, c.name AS city, p.district,
            l.asking_amount::text AS amount, l.asking_currency AS currency,
            to_char(l.submitted_at AT TIME ZONE 'UTC', ${ISO}) AS submitted_at,
            (SELECT count(*)::int FROM listing_images i
              WHERE i.listing_id = l.id AND i.source_kind = 'upload') AS photo_count,
            (SELECT count(*)::int FROM listing_status_events e
              WHERE e.listing_id = l.id AND e.kind = 'status' AND e.to_status = 'submitted')
              AS submission_number,
            l.review_claimed_by, ${SECONDS_LEFT} AS seconds_left,
            count(*) OVER ()::int AS total
     FROM listings l JOIN properties p ON p.id = l.property_id JOIN cities c ON c.slug = p.city_slug
     WHERE ${QUEUE_WHERE}
     ORDER BY l.submitted_at, l.id
     LIMIT $4 OFFSET $5`,
    [...base, pageSize, (page - 1) * pageSize],
  );
  let total = rows[0]?.total ?? 0;
  if (rows.length === 0 && page > 1) {
    const counted = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM listings l JOIN properties p ON p.id = l.property_id
       WHERE ${QUEUE_WHERE}`,
      base,
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
      submissionNumber: Math.max(1, row.submission_number),
      claim: claimOf(moderatorId, row.review_claimed_by, row.seconds_left),
    })),
  };
}

/**
 * The next listing to review after `currentId` in queue order (wrapping to the start), skipping
 * the current one, the moderator's own listings and listings another moderator holds. Null
 * when there is none.
 */
export async function nextInQueue(
  db: SqlClient,
  moderatorId: string,
  currentId: string,
  filters: QueueFilters = {},
): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT l.id FROM listings l JOIN properties p ON p.id = l.property_id
     WHERE ${QUEUE_WHERE} AND l.id <> $4
       AND (l.review_claimed_by IS NULL OR l.review_claimed_by = $1
         OR l.review_claim_expires_at <= clock_timestamp())
     ORDER BY CASE WHEN (l.submitted_at, l.id) >
         (SELECT c.submitted_at, c.id FROM listings c WHERE c.id = $4) THEN 0 ELSE 1 END,
       l.submitted_at, l.id
     LIMIT 1`,
    [moderatorId, filters.city ?? null, filters.propertyType ?? null, currentId],
  );
  return rows[0]?.id ?? null;
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

/** Claim state, submission number and change summary of a submitted listing (callers check). */
export async function reviewMeta(
  db: SqlClient,
  moderatorId: string,
  listingId: string,
): Promise<ReviewMeta> {
  const { rows } = await db.query<{
    review_claimed_by: string | null;
    seconds_left: number | null;
    submission_number: number;
  }>(
    `SELECT l.review_claimed_by, ${SECONDS_LEFT} AS seconds_left,
            (SELECT count(*)::int FROM listing_status_events e
              WHERE e.listing_id = l.id AND e.kind = 'status' AND e.to_status = 'submitted')
              AS submission_number
     FROM listings l WHERE l.id = $1`,
    [listingId],
  );
  const row = rows[0];
  const submissionNumber = Math.max(1, row?.submission_number ?? 1);
  // The fingerprint row of the current submission (the latest 'submitted' event).
  const { rows: prints } = await db.query<{ changed_fields: string[] | null }>(
    `SELECT f.changed_fields FROM listing_submission_fingerprints f
     WHERE f.event_id = (SELECT max(e.id) FROM listing_status_events e
       WHERE e.listing_id = $1 AND e.kind = 'status' AND e.to_status = 'submitted')`,
    [listingId],
  );
  let changes: ChangeSummary;
  if (submissionNumber === 1) changes = { kind: "first" };
  else if (!prints[0] || prints[0].changed_fields === null) changes = { kind: "unknown" };
  else changes = { kind: "changed", fields: prints[0].changed_fields.filter(isChangeField) };
  return {
    claim: claimOf(moderatorId, row?.review_claimed_by ?? null, row?.seconds_left ?? null),
    submissionNumber,
    changes,
  };
}

/**
 * History of a listing (no actor identities, only the role). Owners see status changes only;
 * moderators also see claims and releases.
 */
export async function statusHistory(
  db: SqlClient,
  listingId: string,
  { assignments = false }: { assignments?: boolean } = {},
): Promise<StatusEvent[]> {
  const { rows } = await db.query<{
    kind: "status" | "claim" | "release";
    from_status: UserListingStatus;
    to_status: UserListingStatus;
    actor_role: "owner" | "moderator" | "admin";
    reason: string | null;
    at: string;
  }>(
    `SELECT kind, from_status, to_status, actor_role, reason,
            to_char(created_at AT TIME ZONE 'UTC', ${ISO}) AS at
     FROM listing_status_events WHERE listing_id = $1 AND ($2 OR kind = 'status') ORDER BY id`,
    [listingId, assignments],
  );
  return rows.map((row) => ({
    kind: row.kind,
    from: row.from_status,
    to: row.to_status,
    actorRole: row.actor_role,
    reason: row.reason,
    at: row.at,
  }));
}

export const HISTORY_FILTERS = [
  "approved",
  "changes_requested",
  "rejected",
  "submitted",
  "draft",
  "archived",
  "assignments",
] as const;
export type HistoryFilter = (typeof HISTORY_FILTERS)[number];

export type HistoryQuery = {
  page: number;
  pageSize: number;
  filter?: HistoryFilter;
  /** Calendar days in Tbilisi time, YYYY-MM-DD, inclusive. */
  from?: string;
  to?: string;
};

export type HistoryEntry = StatusEvent & {
  listingId: string;
  title: string;
  /** True when the signed-in moderator made this change. */
  byMe: boolean;
  /** The listing can be opened for review now (submitted, not the moderator's own). */
  reviewable: boolean;
};

/** Review history across all user listings, newest first (moderators only; callers check). */
export async function moderationHistory(
  db: SqlClient,
  moderatorId: string,
  query: HistoryQuery,
): Promise<{ entries: HistoryEntry[]; total: number }> {
  const filter = query.filter ?? null;
  const { rows } = await db.query<{
    kind: "status" | "claim" | "release";
    from_status: UserListingStatus;
    to_status: UserListingStatus;
    actor_role: "owner" | "moderator" | "admin";
    reason: string | null;
    at: string;
    listing_id: string;
    title: string;
    by_me: boolean;
    reviewable: boolean;
    total: number;
  }>(
    `SELECT e.kind, e.from_status, e.to_status, e.actor_role, e.reason,
            to_char(e.created_at AT TIME ZONE 'UTC', ${ISO}) AS at,
            e.listing_id, l.title, e.actor_user_id = $1 AS by_me,
            (l.status = 'submitted' AND l.owner_user_id <> $1) AS reviewable,
            count(*) OVER ()::int AS total
     FROM listing_status_events e JOIN listings l ON l.id = e.listing_id
     WHERE l.data_source = 'user'
       AND ($2::text IS NULL
         OR ($2 = 'assignments' AND e.kind IN ('claim', 'release'))
         OR (e.kind = 'status' AND e.to_status = $2))
       AND ($3::date IS NULL OR e.created_at >= ($3::date)::timestamp AT TIME ZONE 'Asia/Tbilisi')
       AND ($4::date IS NULL
         OR e.created_at < ($4::date + 1)::timestamp AT TIME ZONE 'Asia/Tbilisi')
     ORDER BY e.id DESC
     LIMIT $5 OFFSET $6`,
    [
      moderatorId,
      filter,
      query.from ?? null,
      query.to ?? null,
      query.pageSize,
      (query.page - 1) * query.pageSize,
    ],
  );
  return {
    total: rows[0]?.total ?? 0,
    entries: rows.map((row) => ({
      kind: row.kind,
      from: row.from_status,
      to: row.to_status,
      actorRole: row.actor_role,
      reason: row.reason,
      at: row.at,
      listingId: row.listing_id,
      title: row.title,
      byMe: row.by_me,
      reviewable: row.reviewable,
    })),
  };
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
