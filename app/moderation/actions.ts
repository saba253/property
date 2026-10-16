"use server";

import { draftDeps } from "@/lib/drafts/instance";
import {
  type ClaimOutcome,
  type DecisionKind,
  type DecisionOutcome,
  type SelfApprovalOutcome,
  claimForReview,
  cleanQueueFilters,
  moderate,
  releaseReview,
  selfApproveListing,
} from "@/lib/review/review-service";

/*
 * Moderator actions. The moderator is the session's user; the role is read from the database
 * on every call (user_roles); a moderator's own listing is refused; decisions need the
 * moderator's own unexpired claim. Origin-checked by Next.js.
 */
export async function decideAction(
  listingId: unknown,
  kind: unknown,
  reason: unknown,
  filters: { city?: unknown; type?: unknown } = {},
): Promise<DecisionOutcome> {
  if (kind !== "approve" && kind !== "request-changes" && kind !== "reject") {
    return { ok: false, reason: "not-found" };
  }
  return moderate(
    draftDeps,
    listingId,
    kind as DecisionKind,
    reason,
    cleanQueueFilters(filters ?? {}),
  );
}

export async function claimAction(listingId: unknown): Promise<ClaimOutcome> {
  return claimForReview(draftDeps, listingId);
}

export async function releaseAction(listingId: unknown): Promise<ClaimOutcome> {
  return releaseReview(draftDeps, listingId);
}

/**
 * Administrator self-approval of their own submitted listing. Needs the explicit confirmation
 * value; the administrator role and ownership come from the session and the database only.
 */
export async function selfApproveAction(
  listingId: unknown,
  confirmation: unknown,
  note: unknown,
): Promise<SelfApprovalOutcome> {
  return selfApproveListing(draftDeps, listingId, confirmation, note);
}
