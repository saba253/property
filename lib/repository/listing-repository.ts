import type { ExchangeRateState } from "@/lib/currency/exchange-rate";
import type { DistrictOption } from "@/lib/properties/cities";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import type { ListingFilters } from "@/lib/properties/listing-filters";
import type { SortOption } from "@/lib/properties/listing-sort";
import type { Currency, ListingImage, TransactionType } from "@/lib/properties/types";

/*
 * Read access to listings, independent of where they are stored. Pages and business logic use
 * this interface instead of the demo arrays. Two implementations:
 * - memory (lib/repository/memory-repository.ts): the demo data; the default.
 * - postgres (lib/db/postgres-repository.ts): the same operations in SQL.
 * Both must return the same results for the same data (tests/lib/db/repository-parity.test.ts).
 *
 * Public reads only: listings with a public status (PUBLIC_LISTING_STATUSES) from the allowed
 * data sources. Search, facets and comparables use active listings only. There are no writes.
 */

/** Statuses that may be shown by id. Future moderation states (draft, pending) are excluded. */
export const PUBLIC_LISTING_STATUSES = ["active", "inactive"] as const;

/** Most ids one batch lookup may ask for (favorites hold at most 100). */
export const MAX_BATCH_IDS = 100;

/**
 * Distinct ids in first-seen order. Throws RangeError for more than MAX_BATCH_IDS distinct ids,
 * so a caller cannot turn a batch lookup into an unbounded query.
 */
export function normalizeBatchIds(ids: readonly string[]): string[] {
  const distinct = [...new Set(ids)];
  if (distinct.length > MAX_BATCH_IDS) {
    throw new RangeError(`At most ${MAX_BATCH_IDS} ids per lookup.`);
  }
  return distinct;
}

/**
 * Counts stop at this number: above it the total is reported as "more than COUNT_LIMIT" instead
 * of joining every match just to show an exact figure (measured in db/README.md).
 */
export const COUNT_LIMIT = 1000;

/** Largest page a search may request; protects against unbounded queries. */
export const MAX_PAGE_SIZE = 100;
/** Highest offset accepted; deep pages need cursor pagination (not implemented yet). */
export const MAX_PAGE_OFFSET = 10_000;

export type PageRequest = { offset: number; limit: number };

/** Clamps a page request to safe bounds (whole numbers, 1–MAX_PAGE_SIZE, offset ≤ MAX_PAGE_OFFSET). */
export function normalizePage(page: Partial<PageRequest> | undefined): PageRequest {
  const whole = (value: number | undefined, fallback: number) =>
    value !== undefined && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return {
    offset: Math.min(MAX_PAGE_OFFSET, Math.max(0, whole(page?.offset, 0))),
    limit: Math.min(MAX_PAGE_SIZE, Math.max(1, whole(page?.limit, MAX_PAGE_SIZE))),
  };
}

/** A validated search: filters from parseListingFilters, one rate snapshot, a sort, a page. */
export type ListingSearchQuery = {
  filters: ListingFilters;
  display: Currency;
  rateState: ExchangeRateState;
  sort: SortOption;
  page?: Partial<PageRequest>;
};

export type ListingCount = {
  /** Listings matching every filter, counted up to COUNT_LIMIT. */
  total: number;
  /** False when there are more than COUNT_LIMIT matches (total is then COUNT_LIMIT). */
  totalIsExact: boolean;
  /** Listings that met every other filter but could not be compared with the budget (no rate). */
  notComparableCount: number;
};

export type ListingSearchResult = ListingCount & {
  /** One page, in a deterministic order (sort value, then insertion order). */
  items: ListingWithProperty[];
  page: PageRequest;
  /** Whether at least one more result exists after this page. */
  hasNextPage: boolean;
  /** The sort actually applied (the default order when a price sort was not possible). */
  sortApplied: SortOption;
  sortNotice: "rate-unavailable" | null;
};

/** What the search form needs about the available listings. */
export type SearchFacets = {
  /** Georgian city names of active listings (use getCitiesPresentIn for URL slugs). */
  cityNames: string[];
  /** Districts of active listings, in first-seen order. */
  districts: DistrictOption[];
  /** Active listings per transaction type. */
  totals: Record<TransactionType, number>;
};

export type ListingCover = { coverImage: ListingImage | null; imageCount: number };

export interface ListingRepository {
  readonly backend: "memory" | "postgres";
  /** A public listing with its property, or null when it does not exist or is not public. */
  getListingById(id: string): Promise<ListingWithProperty | null>;
  /**
   * Public listings for the given ids, in the requested order, each once. Unknown and non-public
   * ids are left out (callers report them). One query, at most MAX_BATCH_IDS ids.
   */
  getListingsByIds(ids: readonly string[]): Promise<ListingWithProperty[]>;
  /** Ids of all public listings (for static generation of detail pages). */
  getListingIds(): Promise<string[]>;
  /**
   * Every active listing in default order. Only for small catalogs (the comparison tray, the
   * favorites page and the homepage today); large inventories need targeted queries instead.
   */
  getActiveListings(): Promise<ListingWithProperty[]>;
  getSearchFacets(): Promise<SearchFacets>;
  searchListings(query: ListingSearchQuery): Promise<ListingSearchResult>;
  countListings(query: Omit<ListingSearchQuery, "sort" | "page">): Promise<ListingCount>;
  /** A listing's images in gallery order (cover first). */
  getListingImages(listingId: string): Promise<ListingImage[]>;
  /** Cover and image count per listing id (ids without images get null and 0). */
  getListingCovers(listingIds: readonly string[]): Promise<Record<string, ListingCover>>;
  /**
   * Active listings that may be comparables for `subject` (same transaction, type and city,
   * similar area, other property). lib/analytics/comparables.ts applies the final rules; a
   * backend may return a superset, never less.
   */
  findComparableCandidates(subject: ListingWithProperty): Promise<ListingWithProperty[]>;
}
