import { findCityBySlug } from "@/lib/properties/cities";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import type { Currency } from "@/lib/properties/types";

/**
 * Filters for the demo listings index. All fields are optional; a missing field means "any".
 *
 * Price limits are only meaningful together with `currency`: USD and GEL prices are never
 * compared with each other, and there is no currency conversion.
 */
export type ListingFilters = {
  citySlug?: string;
  currency?: Currency;
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
};

export type NumericFilterKey = "minPrice" | "maxPrice" | "minArea" | "maxArea";

/** Something in the query that was ignored or corrected. The UI turns these into messages. */
export type FilterIssue =
  | { code: "invalid-city" }
  | { code: "invalid-currency" }
  | { code: "invalid-number"; field: NumericFilterKey }
  | { code: "price-needs-currency" }
  | { code: "swapped-price-range" }
  | { code: "swapped-area-range" };

export type ParsedListingFilters = {
  filters: ListingFilters;
  issues: FilterIssue[];
};

/** Raw query parameters, as Next.js provides them in `searchParams`. */
export type RawQuery = Record<string, string | string[] | undefined>;

const CURRENCIES: readonly Currency[] = ["USD", "GEL"];
const NUMERIC_KEYS: readonly NumericFilterKey[] = ["minPrice", "maxPrice", "minArea", "maxArea"];

/** Takes the first value of a repeated parameter and trims it. Empty values become undefined. */
function readParam(query: RawQuery, key: string): string | undefined {
  const raw = query[key];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return value ? value : undefined;
}

/** Accepts plain non-negative numbers; spaces and commas are allowed as thousands separators. */
export function parseNonNegativeNumber(value: string): number | null {
  const normalized = value.replace(/[\s,]/g, "");
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Validates and normalizes query parameters into filters.
 *
 * - Unknown cities, unknown currencies, and invalid numbers are dropped and reported.
 * - A min greater than its max is swapped and reported.
 * - Price limits without a currency are dropped and reported, so currencies are never mixed.
 */
export function parseListingFilters(query: RawQuery): ParsedListingFilters {
  const filters: ListingFilters = {};
  const issues: FilterIssue[] = [];

  const citySlug = readParam(query, "city")?.toLowerCase();
  if (citySlug) {
    if (findCityBySlug(citySlug)) {
      filters.citySlug = citySlug;
    } else {
      issues.push({ code: "invalid-city" });
    }
  }

  const currency = readParam(query, "currency")?.toUpperCase();
  if (currency) {
    const match = CURRENCIES.find((item) => item === currency);
    if (match) {
      filters.currency = match;
    } else {
      issues.push({ code: "invalid-currency" });
    }
  }

  for (const key of NUMERIC_KEYS) {
    const raw = readParam(query, key);
    if (raw === undefined) {
      continue;
    }
    const parsed = parseNonNegativeNumber(raw);
    if (parsed === null) {
      issues.push({ code: "invalid-number", field: key });
    } else {
      filters[key] = parsed;
    }
  }

  if (
    filters.minPrice !== undefined &&
    filters.maxPrice !== undefined &&
    filters.minPrice > filters.maxPrice
  ) {
    [filters.minPrice, filters.maxPrice] = [filters.maxPrice, filters.minPrice];
    issues.push({ code: "swapped-price-range" });
  }

  if (
    filters.minArea !== undefined &&
    filters.maxArea !== undefined &&
    filters.minArea > filters.maxArea
  ) {
    [filters.minArea, filters.maxArea] = [filters.maxArea, filters.minArea];
    issues.push({ code: "swapped-area-range" });
  }

  if (!filters.currency && (filters.minPrice !== undefined || filters.maxPrice !== undefined)) {
    delete filters.minPrice;
    delete filters.maxPrice;
    issues.push({ code: "price-needs-currency" });
  }

  return { filters, issues };
}

/** True when at least one filter is set. */
export function hasActiveFilters(filters: ListingFilters): boolean {
  return Object.values(filters).some((value) => value !== undefined);
}

/**
 * Returns the active listings that match every filter, in their original order.
 * Inactive listings are always excluded. Prices are compared only within the chosen currency.
 */
export function filterListings(
  items: readonly ListingWithProperty[],
  filters: ListingFilters,
): ListingWithProperty[] {
  const cityName = filters.citySlug ? findCityBySlug(filters.citySlug)?.name : undefined;

  return items.filter(({ listing, property }) => {
    if (listing.status !== "active") {
      return false;
    }
    if (filters.citySlug && property.city !== cityName) {
      return false;
    }
    if (filters.currency) {
      const { amount, currency } = listing.askingPrice;
      if (currency !== filters.currency) {
        return false;
      }
      if (filters.minPrice !== undefined && amount < filters.minPrice) {
        return false;
      }
      if (filters.maxPrice !== undefined && amount > filters.maxPrice) {
        return false;
      }
    }
    if (filters.minArea !== undefined && property.areaSqm < filters.minArea) {
      return false;
    }
    if (filters.maxArea !== undefined && property.areaSqm > filters.maxArea) {
      return false;
    }
    return true;
  });
}
