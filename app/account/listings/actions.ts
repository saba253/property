"use server";

import {
  type SaveDraftResult,
  archiveDraftForUser,
  saveDraftForUser,
} from "@/lib/drafts/draft-service";
import { draftDeps } from "@/lib/drafts/instance";

/*
 * Server Actions for private drafts. Next.js accepts them only as POST requests from this site
 * (origin check), and every call checks the session again on the server. The owner is never
 * taken from the arguments.
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
