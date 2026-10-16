import { createRateLimiter } from "@/lib/api/rate-limit";
import { draftToRecords, parseDraftInput } from "@/lib/drafts/draft-input";
import {
  DraftLimitError,
  archiveDraft,
  createDraft,
  getDraft,
  listDrafts,
  updateDraft,
} from "@/lib/drafts/draft-store";
import type { SqlConnection } from "@/lib/db/sql-client";

/*
 * Draft operations for the signed-in user. The user id comes only from `currentUserId()` (the
 * session validated on the server); a request body cannot name an owner, a status or a data
 * source. Results are generic so they never reveal other users' drafts. No Next.js imports, so
 * tests can run it against PGlite or a PostgreSQL server.
 */

export type DraftDeps = {
  /** The verified session's user id, or null when nobody is signed in. */
  currentUserId: () => Promise<string | null>;
  /** Runs `work` on one database connection (needed for transactions). */
  withConnection: <T>(work: (db: SqlConnection) => Promise<T>) => Promise<T>;
};

export type SaveDraftResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason:
        "unauthenticated" | "invalid" | "not-found" | "limit" | "rate-limited" | "unavailable";
      fields?: string[];
    };

const LISTING_ID = /^ul-[0-9a-f-]{36}$/;
// Per process; enough to stop a runaway script, documented as not a production rate limit.
const saveLimiter = createRateLimiter({ limit: 30, windowMs: 10 * 60_000 });

/**
 * What may be logged about a failure: the PostgreSQL SQLSTATE (e.g. 23514, a CHECK constraint;
 * 42P01, a missing table after a skipped migration) or the error class. Never the message, which
 * can contain submitted values.
 */
function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return `SQLSTATE ${code}`;
  return error instanceof Error ? error.constructor.name : "unknown error";
}

export function isDraftId(value: unknown): value is string {
  return typeof value === "string" && LISTING_ID.test(value);
}

export async function saveDraftForUser(
  deps: DraftDeps,
  input: unknown,
  draftId: string | null,
): Promise<SaveDraftResult> {
  const userId = await deps.currentUserId();
  if (!userId) return { ok: false, reason: "unauthenticated" };
  if (!saveLimiter.check(`draft:${userId}`).allowed) return { ok: false, reason: "rate-limited" };
  if (draftId !== null && !isDraftId(draftId)) return { ok: false, reason: "not-found" };
  const draft = parseDraftInput(input);
  if (!draft) return { ok: false, reason: "invalid" };
  const records = draftToRecords(draft);
  if (!records.ok) return { ok: false, reason: "invalid", fields: records.fields };
  try {
    return await deps.withConnection(async (db) => {
      if (draftId === null) return { ok: true, id: await createDraft(db, userId, records.item) };
      const updated = await updateDraft(db, userId, draftId, records.item);
      return updated ? { ok: true, id: draftId } : { ok: false, reason: "not-found" };
    });
  } catch (error) {
    if (error instanceof DraftLimitError) return { ok: false, reason: "limit" };
    console.error("[drafts] save failed:", errorCode(error));
    return { ok: false, reason: "unavailable" };
  }
}

export async function listDraftsForUser(deps: DraftDeps) {
  const userId = await deps.currentUserId();
  if (!userId) return null;
  return deps.withConnection((db) => listDrafts(db, userId));
}

export async function getDraftForUser(deps: DraftDeps, draftId: string) {
  const userId = await deps.currentUserId();
  if (!userId || !isDraftId(draftId)) return null;
  return deps.withConnection((db) => getDraft(db, userId, draftId));
}

export async function archiveDraftForUser(deps: DraftDeps, draftId: unknown): Promise<boolean> {
  const userId = await deps.currentUserId();
  if (!userId || !isDraftId(draftId)) return false;
  return deps.withConnection((db) => archiveDraft(db, userId, draftId));
}
