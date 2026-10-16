"use server";

import { draftDeps } from "@/lib/drafts/instance";
import { type DecisionKind, type DecisionOutcome, moderate } from "@/lib/review/review-service";

/*
 * Moderator decisions. The moderator is the session's user; the role is read from the database
 * on every call (user_roles); a moderator's own listing is refused. Origin-checked by Next.js.
 */
export async function decideAction(
  listingId: unknown,
  kind: unknown,
  reason: unknown,
): Promise<DecisionOutcome> {
  if (kind !== "approve" && kind !== "request-changes" && kind !== "reject") {
    return { ok: false, reason: "not-found" };
  }
  return moderate(draftDeps, listingId, kind as DecisionKind, reason);
}
