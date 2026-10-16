import { createRateLimiter, type RateLimiter } from "@/lib/api/rate-limit";
import type { DraftDeps } from "@/lib/drafts/draft-service";
import { isDraftId } from "@/lib/drafts/draft-service";
import { getOwnedListing } from "@/lib/drafts/draft-store";
import { listPhotos, photosOf } from "@/lib/photos/photo-store";
import { views } from "@/lib/photos/photo-service";
import type { PhotoView } from "@/lib/photos/photo-types";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import {
  type QueueEntry,
  type StatusEvent,
  decide,
  getForReview,
  isModerator,
  listQueue,
  ownedStatus,
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
  | { ok: true }
  | Failure<
      | "unauthenticated"
      | "forbidden"
      | "rate-limited"
      | "not-found"
      | "conflict"
      | "own-listing"
      | "reason-required"
      | "unavailable"
    >;

// Per process. Submitting is rare: 10 per user per day stops scripted spam on a development box.
const defaultLimiters = {
  submit: createRateLimiter({ limit: 10, windowMs: 24 * 60 * 60_000 }),
  decide: createRateLimiter({ limit: 300, windowMs: 10 * 60_000 }),
};

export const QUEUE_PAGE_SIZE = 20;

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

export async function moderate(
  deps: ReviewDeps,
  listingId: unknown,
  kind: DecisionKind,
  reasonInput: unknown,
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
    return result === "ok" ? { ok: true } : { ok: false, reason: result };
  } catch (error) {
    logFailure("decision", error);
    return { ok: false, reason: "unavailable" };
  }
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
): Promise<{ entries: QueueEntry[]; total: number; page: number; pageSize: number } | null> {
  const userId = await deps.currentUserId();
  if (!userId) return null;
  const safePage = Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1;
  return deps.withConnection(async (db) => {
    if (!(await isModerator(db, userId))) return null;
    const result = await listQueue(db, userId, safePage, QUEUE_PAGE_SIZE);
    return { ...result, page: safePage, pageSize: QUEUE_PAGE_SIZE };
  });
}

export type ListingForView = {
  item: ListingWithProperty;
  status: UserListingStatus;
  photos: PhotoView[];
  history: StatusEvent[];
};

/** A submitted listing with photos and history, for a moderator who does not own it. */
export async function reviewDetails(
  deps: ReviewDeps,
  listingId: unknown,
): Promise<ListingForView | null> {
  const userId = await deps.currentUserId();
  if (!userId || !isDraftId(listingId)) return null;
  return deps.withConnection(async (db) => {
    const item = await getForReview(db, userId, listingId);
    if (!item) return null;
    return {
      item,
      status: "submitted",
      photos: views(listingId, await photosOf(db, listingId)),
      history: await statusHistory(db, listingId),
    };
  });
}

/** One of the owner's listings (any status but archived) with photos and history. */
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
