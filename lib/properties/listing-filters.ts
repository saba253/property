import {
  DEFAULT_DISPLAY_CURRENCY,
  type ExchangeRateState,
  convertAmount,
  roundToWholeUnits,
} from "@/lib/currency/exchange-rate";
import { getDisplayPrice } from "@/lib/pricing/display-price";
import { findCityBySlug } from "@/lib/properties/cities";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import type { Currency } from "@/lib/properties/types";

/**
 * Filters for the demo listings index. All fields are optional; a missing field means "any".
 *
 * - `minPrice`/`maxPrice` are a budget in the display currency (USD by default). Listings in
 *   the other currency are compared using the official exchange rate for the request.
 * - `originalCurrency` optionally limits results to listings originally priced in USD or GEL.
 *   It is unrelated to the display currency.
 */
export type ListingFilters = {
  citySlug?: string;
  originalCurrency?: Currency;
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
  | { code: "invalid-display-currency" }
  | { code: "invalid-number"; field: NumericFilterKey }
  | { code: "swapped-price-range" }
  | { code: "swapped-area-range" };

export type ParsedListingFilters = {
  filters: ListingFilters;
  /** Currency for showing prices and for the budget. Defaults to USD. */
  display: Currency;
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

function parseCurrency(value: string): Currency | undefined {
  const upper = value.toUpperCase();
  return CURRENCIES.find((item) => item === upper);
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

/** Reads the display currency (`display`); missing or invalid values fall back to USD. */
export function parseDisplayCurrency(query: RawQuery): {
  display: Currency;
  issue: FilterIssue | null;
} {
  const raw = readParam(query, "display");
  if (!raw) {
    return { display: DEFAULT_DISPLAY_CURRENCY, issue: null };
  }
  const display = parseCurrency(raw);
  return display
    ? { display, issue: null }
    : { display: DEFAULT_DISPLAY_CURRENCY, issue: { code: "invalid-display-currency" } };
}

/**
 * Validates and normalizes query parameters into filters.
 *
 * - Unknown cities, unknown currencies, and invalid numbers are dropped and reported.
 * - A min greater than its max is swapped and reported.
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

  const rawCurrency = readParam(query, "currency");
  if (rawCurrency) {
    const originalCurrency = parseCurrency(rawCurrency);
    if (originalCurrency) {
      filters.originalCurrency = originalCurrency;
    } else {
      issues.push({ code: "invalid-currency" });
    }
  }

  const { display, issue: displayIssue } = parseDisplayCurrency(query);
  if (displayIssue) {
    issues.push(displayIssue);
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

  return { filters, display, issues };
}

/** True when at least one filter is set. The display currency is a view setting, not a filter. */
export function hasActiveFilters(filters: ListingFilters): boolean {
  return Object.values(filters).some((value) => value !== undefined);
}

export function hasPriceFilter(filters: ListingFilters): boolean {
  return filters.minPrice !== undefined || filters.maxPrice !== undefined;
}

export type ListingFilterResult = {
  matches: ListingWithProperty[];
  /**
   * Listings that met every other filter but could not be compared with the budget, because
   * they are priced in another currency and no exchange rate is available.
   */
  notComparableCount: number;
};

/**
 * Returns the active listings that match every filter, in their original order.
 * Inactive listings are always excluded. The budget is compared with the same rounded display
 * price that the UI shows, using one exchange-rate snapshot for the whole request.
 */
export function filterListings(
  items: readonly ListingWithProperty[],
  filters: ListingFilters,
  display: Currency,
  rateState: ExchangeRateState,
): ListingFilterResult {
  const cityName = filters.citySlug ? findCityBySlug(filters.citySlug)?.name : undefined;
  const matches: ListingWithProperty[] = [];
  let notComparableCount = 0;

  for (const item of items) {
    const { listing, property } = item;
    if (listing.status !== "active") continue;
    if (filters.citySlug && property.city !== cityName) continue;
    if (filters.originalCurrency && listing.askingPrice.currency !== filters.originalCurrency) {
      continue;
    }
    if (filters.minArea !== undefined && property.areaSqm < filters.minArea) continue;
    if (filters.maxArea !== undefined && property.areaSqm > filters.maxArea) continue;

    if (hasPriceFilter(filters)) {
      const { amount } = getDisplayPrice(listing.askingPrice, property.areaSqm, display, rateState);
      if (amount === null) {
        notComparableCount++;
        continue;
      }
      if (filters.minPrice !== undefined && amount < filters.minPrice) continue;
      if (filters.maxPrice !== undefined && amount > filters.maxPrice) continue;
    }

    matches.push(item);
  }

  return { matches, notComparableCount };
}

/**
 * Re-expresses the budget when the user switches display currency, so "up to $100,000" becomes
 * roughly the same budget in lari instead of "up to ₾100,000". Without a rate the budget is
 * dropped rather than reinterpreted.
 */
export function convertBudgetForDisplay(
  filters: ListingFilters,
  from: Currency,
  to: Currency,
  rateState: ExchangeRateState,
): ListingFilters {
  if (from === to || !hasPriceFilter(filters)) {
    return filters;
  }
  if (rateState.status !== "available") {
    return { ...filters, minPrice: undefined, maxPrice: undefined };
  }
  const convert = (value: number | undefined) =>
    value === undefined
      ? undefined
      : roundToWholeUnits(convertAmount(value, from, to, rateState.rate));
  return { ...filters, minPrice: convert(filters.minPrice), maxPrice: convert(filters.maxPrice) };
}
