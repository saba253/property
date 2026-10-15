/*
 * Saved ("favorite") listings, kept in the visitor's own browser. Only listing ids are stored:
 * no personal data, no listing contents. Plain functions, so they are easy to test and can later
 * sit in front of a server-side store for signed-in users.
 */

/** Namespaced and versioned, so the format can change later without misreading old data. */
export const FAVORITES_STORAGE_KEY = "property-intelligence:favorites:v1";

/** A sensible upper limit; the oldest saved ids are dropped beyond it. */
export const MAX_FAVORITES = 100;

/** Listing ids are short slugs such as "demo-listing-3". Anything else is ignored. */
const LISTING_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isValidListingId(value: unknown): value is string {
  return typeof value === "string" && LISTING_ID.test(value);
}

/**
 * Keeps valid ids only, removes duplicates (the first occurrence wins, so saving order is kept)
 * and keeps at most MAX_FAVORITES, dropping the oldest.
 */
export function normalizeFavoriteIds(values: readonly unknown[]): string[] {
  const unique = [...new Set(values.filter(isValidListingId))];
  return unique.slice(-MAX_FAVORITES);
}

type StoredFavorites = { version: 1; ids: string[] };

/**
 * Reads the stored value. Missing, malformed or unexpected data gives an empty list instead of an
 * error, and invalid entries are dropped.
 */
export function parseStoredFavorites(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return [];
    const { version, ids } = data as Partial<StoredFavorites>;
    if (version !== 1 || !Array.isArray(ids)) return [];
    return normalizeFavoriteIds(ids);
  } catch {
    return [];
  }
}

export function serializeFavorites(ids: readonly string[]): string {
  const data: StoredFavorites = { version: 1, ids: normalizeFavoriteIds(ids) };
  return JSON.stringify(data);
}

/** Saving order is kept: new ids go to the end. Saving an id twice changes nothing. */
export function addFavorite(ids: readonly string[], id: string): string[] {
  if (!isValidListingId(id) || ids.includes(id)) return [...ids];
  return normalizeFavoriteIds([...ids, id]);
}

export function removeFavorite(ids: readonly string[], id: string): string[] {
  return ids.filter((item) => item !== id);
}

export function toggleFavorite(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? removeFavorite(ids, id) : addFavorite(ids, id);
}

/**
 * Splits saved ids into listings that still exist (newest saved first, for display) and ids
 * whose listing is no longer available (removed or inactive).
 */
export function resolveFavorites(
  ids: readonly string[],
  availableIds: readonly string[],
): { available: string[]; missing: string[] } {
  const known = new Set(availableIds);
  const newestFirst = [...ids].reverse();
  return {
    available: newestFirst.filter((id) => known.has(id)),
    missing: newestFirst.filter((id) => !known.has(id)),
  };
}

/**
 * For the favorites page, which renders only the ids it received in its URL: saved ids that are
 * shown (newest first), saved ids the server looked up but did not find (`missing`), and whether
 * some saved ids were not requested yet (`pending`: the URL is being updated).
 */
export function splitRequestedFavorites(
  savedIds: readonly string[],
  requestedIds: readonly string[],
  foundIds: readonly string[],
): { available: string[]; missing: string[]; pending: boolean } {
  const requested = new Set(requestedIds);
  const found = new Set(foundIds);
  const newestFirst = [...savedIds].reverse();
  return {
    available: newestFirst.filter((id) => found.has(id)),
    missing: newestFirst.filter((id) => requested.has(id) && !found.has(id)),
    pending: savedIds.some((id) => !requested.has(id)),
  };
}
