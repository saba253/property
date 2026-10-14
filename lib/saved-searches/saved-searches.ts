import { DEFAULT_DISPLAY_CURRENCY } from "@/lib/currency/exchange-rate";
import { formatMoney } from "@/lib/pricing/format-money";
import { findCityBySlug } from "@/lib/properties/cities";
import { buildListingsHref, getFilterChips } from "@/lib/properties/filter-chips";
import {
  type ListingFilters,
  type ParseListingFiltersOptions,
  type RawQuery,
  MAX_ROOMS_FILTER,
  getTransaction,
  hasActiveFilters,
  parseListingFilters,
} from "@/lib/properties/listing-filters";
import { type SortOption, parseSort, sortLabel } from "@/lib/properties/listing-sort";
import { PROPERTY_TYPES, TRANSACTION_TYPES } from "@/lib/properties/listing-types";
import type { Currency } from "@/lib/properties/types";

/*
 * Saved searches, kept in the visitor's own browser. A saved search is a name plus the canonical
 * query string of /properties (the same parameters the filter form and links use). Results are
 * never stored: reopening a search runs the normal, validated search on the server.
 *
 * Decision: the list/map view is a presentation preference and is NOT saved; a saved search
 * reopens as a list. The display currency IS saved (budgets are expressed in it), and so is the
 * sort order.
 */

export const SAVED_SEARCHES_STORAGE_KEY = "property-intelligence:saved-searches:v1";
export const MAX_SAVED_SEARCHES = 20;
export const MAX_SEARCH_NAME_LENGTH = 60;
const MAX_QUERY_LENGTH = 600;

/** Query parameters a saved search may contain (everything else is dropped as obsolete). */
export const SAVED_SEARCH_PARAMS = [
  "display",
  "sort",
  "transaction",
  "type",
  "city",
  "currency",
  "minPrice",
  "maxPrice",
  "minArea",
  "maxArea",
  "district",
  "rooms",
  "minBedrooms",
  "minBathrooms",
  "minFloor",
  "maxFloor",
  "amenity",
] as const;

const SEARCH_ID = /^s-[a-z0-9]{4,32}$/;

export type SavedSearch = { id: string; name: string; query: string };

/** Trims and collapses spaces; returns "" for an empty name. */
export function normalizeSearchName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, MAX_SEARCH_NAME_LENGTH);
}

/** Keeps only supported parameters (in their original order) and limits the length. */
export function sanitizeSearchQuery(query: string): string {
  const allowed = new Set<string>(SAVED_SEARCH_PARAMS);
  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  const kept = new URLSearchParams();
  for (const [key, value] of params) {
    if (allowed.has(key) && value.trim() !== "") kept.append(key, value);
  }
  const text = kept.toString();
  return text.length > MAX_QUERY_LENGTH ? "" : text;
}

/** The query string as Next.js-style search params (repeated keys become arrays). */
export function queryToRawQuery(query: string): RawQuery {
  const params = new URLSearchParams(query);
  const raw: RawQuery = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    raw[key] = values.length > 1 ? values : values[0];
  }
  return raw;
}

/**
 * Canonical query for a validated search, built with the same URL builder as every link on
 * /properties, without the view. Empty when nothing differs from the defaults.
 */
export function canonicalSearchQuery(
  filters: ListingFilters,
  display: Currency,
  sort: SortOption,
): string {
  const href = buildListingsHref(filters, display, "list", sort);
  const index = href.indexOf("?");
  return index === -1 ? "" : href.slice(index + 1);
}

/** Worth saving: at least one filter, or the rental listings (sale is the default). */
export function isSaveableSearch(filters: ListingFilters): boolean {
  return hasActiveFilters(filters) || getTransaction(filters) === "rent";
}

function priceRange(filters: ListingFilters, display: Currency): string | null {
  const min = filters.minPrice;
  const max = filters.maxPrice;
  if (min === undefined && max === undefined) return null;
  const rent = getTransaction(filters) === "rent" ? " / თვე" : "";
  if (min !== undefined && max !== undefined) {
    return `${formatMoney(min, display)}–${formatMoney(max, display)}${rent}`;
  }
  if (max !== undefined) return `${formatMoney(max, display)}-მდე${rent}`;
  return `${formatMoney(min!, display)}-დან${rent}`;
}

export type SearchDescription = {
  /** Name built only from the criteria actually set, e.g. "ქირავდება · ბინა · თბილისი". */
  suggestedName: string;
  /** Every criterion as a short Georgian label (same wording as the filter chips). */
  criteria: string[];
};

/** Describes a validated search; nothing is added that the visitor did not choose. */
export function describeSearch(
  filters: ListingFilters,
  display: Currency,
  sort: SortOption,
): SearchDescription {
  const transaction = TRANSACTION_TYPES[getTransaction(filters)].label;
  const city = filters.citySlug ? findCityBySlug(filters.citySlug)?.name : undefined;
  const parts = [
    transaction,
    filters.propertyType ? PROPERTY_TYPES[filters.propertyType].label : null,
    filters.district ? (city ? `${city}, ${filters.district}` : filters.district) : (city ?? null),
    filters.rooms !== undefined
      ? `${filters.rooms >= MAX_ROOMS_FILTER ? `${MAX_ROOMS_FILTER}+` : filters.rooms} ოთახი`
      : null,
    priceRange(filters, display),
  ].filter((part): part is string => part !== null);

  const criteria = [
    transaction,
    ...getFilterChips(filters, display).map((chip) => chip.label),
    ...(display !== DEFAULT_DISPLAY_CURRENCY ? [`ჩვენების ვალუტა: ${display}`] : []),
    ...(sort !== "default" ? [`დალაგება: ${sortLabel(sort)}`] : []),
  ];

  return { suggestedName: normalizeSearchName(parts.join(" · ")), criteria };
}

export type ParsedSavedSearch = SearchDescription & {
  href: string;
  /** True when a stored parameter is no longer valid (it is ignored when the search is opened). */
  hasIgnoredParts: boolean;
};

/**
 * Reads a stored query with the same validation as /properties, to show its criteria and to
 * reopen it. Invalid or obsolete parts are reported, never silently treated as valid.
 */
export function parseSavedSearchQuery(
  query: string,
  options: ParseListingFiltersOptions = {},
): ParsedSavedSearch {
  const raw = queryToRawQuery(query);
  const parsed = parseListingFilters(raw, options);
  const { sort, invalid } = parseSort(raw);
  const canonical = canonicalSearchQuery(parsed.filters, parsed.display, sort);
  return {
    ...describeSearch(parsed.filters, parsed.display, sort),
    href: canonical ? `/properties?${canonical}` : "/properties",
    hasIgnoredParts: parsed.issues.length > 0 || invalid,
  };
}

/** Reads stored saved searches; malformed, invalid and duplicate entries are dropped. */
export function parseStoredSavedSearches(raw: string | null): SavedSearch[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return [];
    const { version, searches } = data as { version?: unknown; searches?: unknown };
    if (version !== 1 || !Array.isArray(searches)) return [];
    const result: SavedSearch[] = [];
    const seenQueries = new Set<string>();
    const seenIds = new Set<string>();
    for (const entry of searches) {
      if (typeof entry !== "object" || entry === null) continue;
      const { id, name, query } = entry as Record<string, unknown>;
      if (typeof id !== "string" || !SEARCH_ID.test(id) || seenIds.has(id)) continue;
      if (typeof name !== "string" || typeof query !== "string") continue;
      const cleanName = normalizeSearchName(name);
      const cleanQuery = sanitizeSearchQuery(query);
      if (!cleanName || !cleanQuery || seenQueries.has(cleanQuery)) continue;
      seenIds.add(id);
      seenQueries.add(cleanQuery);
      result.push({ id, name: cleanName, query: cleanQuery });
      if (result.length === MAX_SAVED_SEARCHES) break;
    }
    return result;
  } catch {
    return [];
  }
}

export function serializeSavedSearches(searches: readonly SavedSearch[]): string {
  return JSON.stringify({ version: 1, searches });
}

export type AddSearchOutcome = "added" | "duplicate" | "full" | "invalid";

/**
 * Adds a search unless the same criteria are already saved (compared by canonical query), the
 * limit is reached, or the name or query is empty. An empty name should be replaced by the
 * suggested name before calling this.
 */
export function addSavedSearch(
  searches: readonly SavedSearch[],
  entry: { id: string; name: string; query: string },
): { searches: SavedSearch[]; outcome: AddSearchOutcome; existing?: SavedSearch } {
  const unchanged = [...searches];
  const name = normalizeSearchName(entry.name);
  const query = sanitizeSearchQuery(entry.query);
  if (!SEARCH_ID.test(entry.id) || !name || !query)
    return { searches: unchanged, outcome: "invalid" };
  const existing = searches.find((search) => search.query === query);
  if (existing) return { searches: unchanged, outcome: "duplicate", existing };
  if (searches.length >= MAX_SAVED_SEARCHES) return { searches: unchanged, outcome: "full" };
  return { searches: [...searches, { id: entry.id, name, query }], outcome: "added" };
}

/** Renames a search; an empty name leaves it unchanged. */
export function renameSavedSearch(
  searches: readonly SavedSearch[],
  id: string,
  name: string,
): SavedSearch[] {
  const clean = normalizeSearchName(name);
  if (!clean) return [...searches];
  return searches.map((search) => (search.id === id ? { ...search, name: clean } : search));
}

export function removeSavedSearch(searches: readonly SavedSearch[], id: string): SavedSearch[] {
  return searches.filter((search) => search.id !== id);
}

/** Equality for the store (same entries in the same order). */
export function sameSavedSearches(a: readonly SavedSearch[], b: readonly SavedSearch[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (search, index) =>
        search.id === b[index].id &&
        search.name === b[index].name &&
        search.query === b[index].query,
    )
  );
}

/** A new id for a saved search, without needing a secure context. */
export function createSearchId(now: number = Date.now(), random: number = Math.random()): string {
  return `s-${now.toString(36)}${Math.floor(random * 1e8).toString(36)}`.slice(0, 34);
}
