"use server";

import {
  type SaveDraftResult,
  archiveDraftForUser,
  saveDraftForUser,
} from "@/lib/drafts/draft-service";
import { draftDeps } from "@/lib/drafts/instance";
import {
  type SubmitResult,
  submitForReview,
  withdrawSubmission,
} from "@/lib/review/review-service";

/*
 * Server Actions for the owner's private listings. Next.js accepts them only as POST requests
 * from this site (origin check), and every call checks the session again on the server. The
 * owner is never taken from the arguments.
 */

export async function saveDraftAction(
  input: unknown,
  draftId: string | null,
): Promise<SaveDraftResult> {
  return saveDraftForUser(draftDeps, input, draftId);
}

export async function archiveDraftAction(draftId: unknown): Promise<{ ok: boolean }> {
  return { ok: await archiveDraftForUser(draftDeps, draftId) };
}

/** Sends a complete listing with at least one stored photo to moderation. */
export async function submitForReviewAction(listingId: unknown): Promise<SubmitResult> {
  return submitForReview(draftDeps, listingId);
}

/** Takes a submission back before a moderator has decided (it becomes a draft again). */
export async function withdrawSubmissionAction(listingId: unknown): Promise<SubmitResult> {
  return withdrawSubmission(draftDeps, listingId);
}
