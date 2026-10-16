import { createRateLimiter, type RateLimiter } from "@/lib/api/rate-limit";
import type { DraftDeps } from "@/lib/drafts/draft-service";
import { isDraftId } from "@/lib/drafts/draft-service";
import { getOwnedListing } from "@/lib/drafts/draft-store";
import { listPhotos, photosOf } from "@/lib/photos/photo-store";
import { views } from "@/lib/photos/photo-service";
import type { PhotoView } from "@/lib/photos/photo-types";
import { findCityBySlug } from "@/lib/properties/cities";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import { PROPERTY_TYPES } from "@/lib/properties/listing-types";
import type { PropertyType } from "@/lib/properties/types";
import {
  HISTORY_FILTERS,
  type HistoryEntry,
  type HistoryFilter,
  type QueueEntry,
  type QueueFilters,
  type ReviewMeta,
  type StatusEvent,
  claimListing,
  decide,
  getForReview,
  isModerator,
  listQueue,
  moderationHistory,
  nextInQueue,
  ownedStatus,
  releaseClaim,
  reviewMeta,
  statusHistory,
  submitListing,
  withdrawListing,
} from "@/lib/review/review-store";
import { MAX_REASON_LENGTH, type UserListingStatus } from "@/lib/review/statuses";

/*
 * Submission and moderation for the signed-in user (no Next.js imports; tests run it on PGlite
 * and on a PostgreSQL server). The user id comes only from the verified session; the moderator
 * role only from the database (user_roles), checked on every call. Results are short codes; a
 * listing the user may not see behaves like a missing one.
 */

export type ReviewDeps = DraftDeps & {
  limiters?: { submit: RateLimiter; decide: RateLimiter };
};

type Failure<R extends string> = { ok: false; reason: R };
export type SubmitResult =
  | { ok: true }
  | Failure<
      | "unauthenticated"
      | "rate-limited"
      | "not-found"
      | "conflict"
      | "incomplete"
      | "no-photo"
      | "unavailable"
    >;
export type DecisionKind = "approve" | "request-changes" | "reject";
export type DecisionOutcome =
  | { ok: true; next: string | null }
  | Failure<
      | "unauthenticated"
      | "forbidden"
      | "rate-limited"
      | "not-found"
      | "conflict"
      | "own-listing"
      | "claimed"
      | "not-claimed"
      | "reason-required"
      | "unavailable"
    >;
export type ClaimOutcome =
  | { ok: true }
  | Failure<
      | "unauthenticated"
      | "forbidden"
      | "rate-limited"
      | "not-found"
      | "conflict"
      | "own-listing"
      | "claimed"
      | "not-claimed"
      | "unavailable"
    >;

// Per process. Submitting is rare: 10 per user per day stops scripted spam on a development box.
// Claims, releases and decisions share the moderator limit.
const defaultLimiters = {
  submit: createRateLimiter({ limit: 10, windowMs: 24 * 60 * 60_000 }),
  decide: createRateLimiter({ limit: 300, windowMs: 10 * 60_000 }),
};

export const QUEUE_PAGE_SIZE = 20;
export const HISTORY_PAGE_SIZE = 30;

function logFailure(operation: string, error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  console.error(
    `[review] ${operation} failed:`,
    typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)
      ? `SQLSTATE ${code}`
      : error instanceof Error
        ? error.constructor.name
        : "unknown error",
  );
}

/** A moderator's reason: trimmed, control characters removed, 1..1000 characters. */
export function cleanReason(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const text = input.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim();
  return text.length >= 1 && text.length <= MAX_REASON_LENGTH ? text : null;
}

/** Queue filters from untrusted input: known city slugs and property types only. */
export function cleanQueueFilters(input: { city?: unknown; type?: unknown }): QueueFilters {
  const filters: QueueFilters = {};
  if (typeof input.city === "string" && findCityBySlug(input.city)) filters.city = input.city;
  if (typeof input.type === "string" && input.type in PROPERTY_TYPES) {
    filters.propertyType = input.type as PropertyType;
  }
  return filters;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
function cleanDay(value: unknown): string | undefined {
  if (typeof value !== "string" || !DAY.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? undefined
    : value;
}

function cleanPage(page: unknown): number {
  const n = typeof page === "number" ? page : Number(page);
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1;
}

export async function submitForReview(deps: ReviewDeps, listingId: unknown): Promise<SubmitResult> {
  const userId = await deps.currentUserId();
  if (!userId) return { ok: false, reason: "unauthenticated" };
  if (!isDraftId(listingId)) return { ok: false, reason: "not-found" };
  if (!(deps.limiters ?? defaultLimiters).submit.check(`submit:${userId}`).allowed) {
    return { ok: false, reason: "rate-limited" };
  }
  try {
    const result = await deps.withConnection((db) => submitListing(db, userId, listingId));
    return result === "ok" ? { ok: true } : { ok: false, reason: result };
  } catch (error) {
    logFailure("submit", error);
    return { ok: false, reason: "unavailable" };
  }
}

export async function withdrawSubmission(
  deps: ReviewDeps,
  listingId: unknown,
): Promise<SubmitResult> {
  const userId = await deps.currentUserId();
  if (!userId) return { ok: false, reason: "unauthenticated" };
  if (!isDraftId(listingId)) return { ok: false, reason: "not-found" };
  try {
    const result = await deps.withConnection((db) => withdrawListing(db, userId, listingId));
    return result === "ok" ? { ok: true } : { ok: false, reason: result };
  } catch (error) {
    logFailure("withdraw", error);
    return { ok: false, reason: "unavailable" };
  }
}

/** Claims (or renews) a submitted listing for the signed-in moderator. */
export async function claimForReview(deps: ReviewDeps, listingId: unknown): Promise<ClaimOutcome> {
  const userId = await deps.currentUserId();
  if (!userId) return { ok: false, reason: "unauthenticated" };
  if (!(deps.limiters ?? defaultLimiters).decide.check(`decide:${userId}`).allowed) {
    return { ok: false, reason: "rate-limited" };
  }
  if (!isDraftId(listingId)) return { ok: false, reason: "not-found" };
  try {
    const result = await deps.withConnection((db) => claimListing(db, userId, listingId));
    return result === "ok" ? { ok: true } : { ok: false, reason: result };
  } catch (error) {
    logFailure("claim", error);
    return { ok: false, reason: "unavailable" };
  }
}

/** Releases the signed-in moderator's claim. */
export async function releaseReview(deps: ReviewDeps, listingId: unknown): Promise<ClaimOutcome> {
  const userId = await deps.currentUserId();
  if (!userId) return { ok: false, reason: "unauthenticated" };
  if (!(deps.limiters ?? defaultLimiters).decide.check(`decide:${userId}`).allowed) {
    return { ok: false, reason: "rate-limited" };
  }
  if (!isDraftId(listingId)) return { ok: false, reason: "not-found" };
  try {
    const result = await deps.withConnection((db) => releaseClaim(db, userId, listingId));
    return result === "ok" ? { ok: true } : { ok: false, reason: result };
  } catch (error) {
    logFailure("release", error);
    return { ok: false, reason: "unavailable" };
  }
}

/** A decision by the moderator holding the claim; `next` is the next listing to review. */
export async function moderate(
  deps: ReviewDeps,
  listingId: unknown,
  kind: DecisionKind,
  reasonInput: unknown,
  filters: QueueFilters = {},
): Promise<DecisionOutcome> {
  const userId = await deps.currentUserId();
  if (!userId) return { ok: false, reason: "unauthenticated" };
  if (!(deps.limiters ?? defaultLimiters).decide.check(`decide:${userId}`).allowed) {
    return { ok: false, reason: "rate-limited" };
  }
  if (!isDraftId(listingId)) return { ok: false, reason: "not-found" };
  const to =
    kind === "approve" ? "approved" : kind === "request-changes" ? "changes_requested" : "rejected";
  const reason = kind === "approve" ? null : cleanReason(reasonInput);
  if (kind !== "approve" && !reason) return { ok: false, reason: "reason-required" };
  try {
    const result = await deps.withConnection((db) => decide(db, userId, listingId, to, reason));
    if (result !== "ok") return { ok: false, reason: result };
  } catch (error) {
    logFailure("decision", error);
    return { ok: false, reason: "unavailable" };
  }
  // The decision is committed; the next listing is only a convenience.
  const next = await deps
    .withConnection((db) => nextInQueue(db, userId, listingId, filters))
    .catch(() => null);
  return { ok: true, next };
}

/** Whether the signed-in user is a moderator (false when signed out). */
export async function currentUserIsModerator(deps: ReviewDeps): Promise<boolean> {
  const userId = await deps.currentUserId();
  if (!userId) return false;
  return deps.withConnection((db) => isModerator(db, userId));
}

/** The review queue for a moderator; null for everyone else. */
export async function moderationQueue(
  deps: ReviewDeps,
  page: number,
  filters: QueueFilters = {},
): Promise<{ entries: QueueEntry[]; total: number; page: number; pageSize: number } | null> {
  const userId = await deps.currentUserId();
  if (!userId) return null;
  const safePage = cleanPage(page);
  return deps.withConnection(async (db) => {
    if (!(await isModerator(db, userId))) return null;
    const result = await listQueue(db, userId, safePage, QUEUE_PAGE_SIZE, filters);
    return { ...result, page: safePage, pageSize: QUEUE_PAGE_SIZE };
  });
}

/** Review history for moderators (null for everyone else). Filters are validated here. */
export async function reviewHistory(
  deps: ReviewDeps,
  input: { page?: unknown; filter?: unknown; from?: unknown; to?: unknown },
): Promise<{
  entries: HistoryEntry[];
  total: number;
  page: number;
  pageSize: number;
  filter: HistoryFilter | null;
  from: string | null;
  to: string | null;
} | null> {
  const userId = await deps.currentUserId();
  if (!userId) return null;
  const page = cleanPage(input.page ?? 1);
  const filter = (HISTORY_FILTERS as readonly unknown[]).includes(input.filter)
    ? (input.filter as HistoryFilter)
    : undefined;
  const from = cleanDay(input.from);
  const to = cleanDay(input.to);
  return deps.withConnection(async (db) => {
    if (!(await isModerator(db, userId))) return null;
    const result = await moderationHistory(db, userId, {
      page,
      pageSize: HISTORY_PAGE_SIZE,
      filter,
      from,
      to,
    });
    return {
      ...result,
      page,
      pageSize: HISTORY_PAGE_SIZE,
      filter: filter ?? null,
      from: from ?? null,
      to: to ?? null,
    };
  });
}

export type ListingForView = {
  item: ListingWithProperty;
  status: UserListingStatus;
  photos: PhotoView[];
  history: StatusEvent[];
};

export type ListingForReview = ListingForView & { meta: ReviewMeta; next: string | null };

/**
 * A submitted listing with photos, history (including claims), claim state, change summary and
 * the next listing, for a moderator who does not own it.
 */
export async function reviewDetails(
  deps: ReviewDeps,
  listingId: unknown,
  filters: QueueFilters = {},
): Promise<ListingForReview | null> {
  const userId = await deps.currentUserId();
  if (!userId || !isDraftId(listingId)) return null;
  return deps.withConnection(async (db) => {
    const item = await getForReview(db, userId, listingId);
    if (!item) return null;
    return {
      item,
      status: "submitted",
      photos: views(listingId, await photosOf(db, listingId)),
      history: await statusHistory(db, listingId, { assignments: true }),
      meta: await reviewMeta(db, userId, listingId),
      next: await nextInQueue(db, userId, listingId, filters),
    };
  });
}

/** One of the owner's listings (any status but archived) with photos and status history. */
export async function ownerListingView(
  deps: ReviewDeps,
  listingId: unknown,
): Promise<ListingForView | null> {
  const userId = await deps.currentUserId();
  if (!userId || !isDraftId(listingId)) return null;
  return deps.withConnection(async (db) => {
    const status = await ownedStatus(db, userId, listingId);
    const item = status ? await getOwnedListing(db, userId, listingId) : null;
    if (!status || !item) return null;
    return {
      item,
      status,
      photos: views(listingId, (await listPhotos(db, userId, listingId)) ?? []),
      history: await statusHistory(db, listingId),
    };
  });
}
