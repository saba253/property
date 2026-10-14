import { type ExchangeRateState, convertAmount } from "@/lib/currency/exchange-rate";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import type { RawQuery } from "@/lib/properties/listing-filters";
import type { Currency } from "@/lib/properties/types";

/** URL values of the sort options. Missing `sort` means the default order. */
export type SortKey =
  | "price_asc"
  | "price_desc"
  | "area_asc"
  | "area_desc"
  | "price_per_sqm_asc"
  | "price_per_sqm_desc";

/** "default" keeps the data order; it is not a recommendation or ranking. */
export type SortOption = SortKey | "default";

export const SORT_OPTIONS: readonly { value: SortOption; label: string }[] = [
  { value: "default", label: "ნაგულისხმევი" },
  { value: "price_asc", label: "ფასი: იაფიდან ძვირისკენ" },
  { value: "price_desc", label: "ფასი: ძვირიდან იაფისკენ" },
  { value: "area_asc", label: "ფართი: პატარიდან დიდისკენ" },
  { value: "area_desc", label: "ფართი: დიდიდან პატარისკენ" },
  { value: "price_per_sqm_asc", label: "ფასი მ²-ზე: ზრდადობით" },
  { value: "price_per_sqm_desc", label: "ფასი მ²-ზე: კლებადობით" },
];

const SORT_KEYS = new Set<string>(
  SORT_OPTIONS.map((option) => option.value).filter((v) => v !== "default"),
);

export function isSortKey(value: string): value is SortKey {
  return SORT_KEYS.has(value);
}

export function sortLabel(sort: SortOption): string {
  return SORT_OPTIONS.find((option) => option.value === sort)!.label;
}

/**
 * Reads `sort` from the query. Missing means the default order; unknown values also fall back to
 * the default order, with `invalid` set so the page can say so.
 */
export function parseSort(query: RawQuery): { sort: SortOption; invalid: boolean } {
  const raw = query.sort;
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();
  if (!value) return { sort: "default", invalid: false };
  return isSortKey(value) ? { sort: value, invalid: false } : { sort: "default", invalid: true };
}

/**
 * Prices are compared in one base currency, whatever the display currency, so switching between
 * USD and GEL never changes the order (the rate is a constant factor). The value is not rounded:
 * rounding is for display only.
 */
const BASE_CURRENCY: Currency = "USD";

export type Measure = "price" | "area" | "price_per_sqm";

function parseKey(sort: SortKey): { measure: Measure; direction: 1 | -1 } {
  const direction = sort.endsWith("_desc") ? -1 : 1;
  const measure = sort.replace(/_(asc|desc)$/, "") as Measure;
  return { measure, direction };
}

/**
 * Asking price in the comparison currency, or null when it cannot be compared: another currency
 * and no rate. Sale prices and monthly rents are never mixed (see sortListings).
 */
function comparablePrice(
  item: ListingWithProperty,
  currency: Currency,
  rateState: ExchangeRateState,
): number | null {
  const { amount, currency: original } = item.listing.askingPrice;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (original === currency) return amount;
  if (rateState.status !== "available") return null;
  return convertAmount(amount, original, currency, rateState.rate);
}

/**
 * A listing's value for one measure as a plain number in `currency` (not rounded), or null when it
 * cannot be compared honestly (for example another currency and no exchange rate, or no area).
 * Shared by sorting and by the comparison page.
 */
export function comparableMeasure(
  item: ListingWithProperty,
  measure: Measure,
  currency: Currency,
  rateState: ExchangeRateState,
): number | null {
  const area = item.property.areaSqm;
  const validArea = Number.isFinite(area) && area > 0 ? area : null;
  switch (measure) {
    case "area":
      return validArea;
    case "price":
      return comparablePrice(item, currency, rateState);
    case "price_per_sqm": {
      const price = comparablePrice(item, currency, rateState);
      return price === null || validArea === null ? null : price / validArea;
    }
  }
}

/**
 * The currency in which prices of these listings can be compared: the base currency (USD) when an
 * exchange rate is available, the listings' own currency when they all share one, otherwise null
 * (USD and GEL without a rate cannot be compared honestly).
 */
export function priceComparisonCurrency(
  items: readonly ListingWithProperty[],
  rateState: ExchangeRateState,
): Currency | null {
  if (rateState.status === "available") return BASE_CURRENCY;
  const currencies = new Set(items.map((item) => item.listing.askingPrice.currency));
  if (currencies.size > 1) return null;
  return [...currencies][0] ?? BASE_CURRENCY;
}

export type SortResult = {
  items: ListingWithProperty[];
  /** The sort that was actually applied (the default order when the requested one was not possible). */
  applied: SortOption;
  /**
   * "rate-unavailable": a price sort was requested for listings in both USD and GEL, but there is
   * no exchange rate, so prices cannot be compared honestly; the default order is kept instead.
   */
  notice: "rate-unavailable" | null;
};

/**
 * Sorts filtered listings and returns a new array (the input is not changed).
 *
 * - Ties keep the original order (stable), so the result is deterministic.
 * - Listings without a comparable value (for example an invalid area) go last in both directions.
 * - Sale and monthly rent are never compared with each other: if both appear, each transaction
 *   type is sorted separately and the groups keep their original order.
 * - Price sorts across USD and GEL use one exchange-rate snapshot. Without a rate, mixed
 *   currencies cannot be compared, so the default order is returned with a notice.
 */
export function sortListings(
  items: readonly ListingWithProperty[],
  sort: SortOption,
  rateState: ExchangeRateState,
): SortResult {
  if (sort === "default") return { items: [...items], applied: "default", notice: null };
  const { measure, direction } = parseKey(sort);

  const currency = measure === "area" ? BASE_CURRENCY : priceComparisonCurrency(items, rateState);
  if (currency === null) {
    return { items: [...items], applied: "default", notice: "rate-unavailable" };
  }

  const keyed = items.map((item, index) => ({
    item,
    index,
    group: item.listing.transactionType,
    value: comparableMeasure(item, measure, currency, rateState),
  }));
  const groupOrder = [...new Set(keyed.map((entry) => entry.group))];

  keyed.sort((a, b) => {
    const group = groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group);
    if (group !== 0) return group;
    if (a.value === null || b.value === null) {
      if (a.value === null && b.value === null) return a.index - b.index;
      return a.value === null ? 1 : -1;
    }
    return (a.value - b.value) * direction || a.index - b.index;
  });

  return { items: keyed.map((entry) => entry.item), applied: sort, notice: null };
}
