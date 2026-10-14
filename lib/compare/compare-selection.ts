import { isValidListingId } from "@/lib/favorites/favorites";
import type { TransactionType } from "@/lib/properties/types";

/*
 * The comparison selection: up to four listing ids, kept in this browser. Only ids are stored.
 * Listings must share one transaction type: a sale price and a monthly rent are never compared.
 */

export const COMPARE_STORAGE_KEY = "property-intelligence:compare:v1";
export const MIN_COMPARE = 2;
export const MAX_COMPARE = 4;

/** Valid, distinct ids, at most MAX_COMPARE (the first ones are kept). */
export function normalizeComparisonIds(values: readonly unknown[]): string[] {
  return [...new Set(values.filter(isValidListingId))].slice(0, MAX_COMPARE);
}

export function parseStoredComparison(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return [];
    const { version, ids } = data as { version?: unknown; ids?: unknown };
    if (version !== 1 || !Array.isArray(ids)) return [];
    return normalizeComparisonIds(ids);
  } catch {
    return [];
  }
}

export function serializeComparison(ids: readonly string[]): string {
  return JSON.stringify({ version: 1, ids: normalizeComparisonIds(ids) });
}

/** Looks up a listing's transaction type; undefined for unknown (for example deleted) ids. */
export type TransactionLookup = (id: string) => TransactionType | undefined;

export type AddOutcome = "added" | "already-selected" | "full" | "mixed-transaction" | "invalid";

/**
 * Tries to add a listing. The selection is unchanged unless the outcome is "added":
 * duplicates, a fifth listing, unknown ids and a different transaction type are refused.
 * Ids of listings that no longer exist do not count.
 */
export function addToComparison(
  ids: readonly string[],
  id: string,
  transactionOf: TransactionLookup,
): { ids: string[]; outcome: AddOutcome } {
  const unchanged = [...ids];
  const transaction = transactionOf(id);
  if (!isValidListingId(id) || transaction === undefined) {
    return { ids: unchanged, outcome: "invalid" };
  }
  if (ids.includes(id)) return { ids: unchanged, outcome: "already-selected" };
  const known = ids.filter((item) => transactionOf(item) !== undefined);
  if (known.some((item) => transactionOf(item) !== transaction)) {
    return { ids: unchanged, outcome: "mixed-transaction" };
  }
  if (known.length >= MAX_COMPARE) return { ids: unchanged, outcome: "full" };
  return { ids: [...known, id], outcome: "added" };
}

export function removeFromComparison(ids: readonly string[], id: string): string[] {
  return ids.filter((item) => item !== id);
}

/** Drops ids whose listing no longer exists. */
export function pruneComparison(
  ids: readonly string[],
  transactionOf: TransactionLookup,
): string[] {
  return ids.filter((id) => transactionOf(id) !== undefined);
}

export type ComparisonReadiness =
  | { ready: true; transaction: TransactionType }
  | { ready: false; reason: "too-few" | "mixed-transaction" };

/** Whether the selection can be shown as a comparison (2-4 existing listings of one type). */
export function getComparisonReadiness(
  ids: readonly string[],
  transactionOf: TransactionLookup,
): ComparisonReadiness {
  const transactions = pruneComparison(ids, transactionOf).map((id) => transactionOf(id)!);
  if (new Set(transactions).size > 1) return { ready: false, reason: "mixed-transaction" };
  if (transactions.length < MIN_COMPARE) return { ready: false, reason: "too-few" };
  return { ready: true, transaction: transactions[0] };
}

/** Georgian explanations for refused additions. */
export const COMPARE_MESSAGES: Record<Exclude<AddOutcome, "added">, string> = {
  "already-selected": "ეს განცხადება უკვე შედარებაშია.",
  full: `შედარებაში მაქსიმუმ ${MAX_COMPARE} განცხადება ეტევა. ჯერ ამოშალეთ ერთ-ერთი.`,
  "mixed-transaction":
    "გასაყიდი და გასაქირავებელი განცხადებები ერთად ვერ შედარდება: გასაყიდი ფასი და თვიური ქირა სხვადასხვა რამაა. ჯერ გაასუფთავეთ შედარება ან დაამატეთ იმავე ტიპის განცხადება.",
  invalid: "ეს განცხადება შედარებისთვის მიუწვდომელია.",
};
