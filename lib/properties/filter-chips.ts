import { DEFAULT_DISPLAY_CURRENCY } from "@/lib/currency/exchange-rate";
import { formatArea, formatMoney } from "@/lib/pricing/format-money";
import { findCityBySlug } from "@/lib/properties/cities";
import type { ListingFilters } from "@/lib/properties/listing-filters";
import type { Currency } from "@/lib/properties/types";

const LISTINGS_PATH = "/properties";

/** One applied filter, shown as a removable chip. `removeHref` is the URL without it. */
export type FilterChip = {
  key: "city" | "originalCurrency" | "price" | "area";
  label: string;
  removeHref: string;
};

/**
 * Builds a canonical `/properties` URL. Unset filters are left out, and so is the display
 * currency when it is the default (USD), to keep shared links short.
 */
export function buildListingsHref(
  filters: ListingFilters,
  display: Currency = DEFAULT_DISPLAY_CURRENCY,
): string {
  const params = new URLSearchParams();
  if (display !== DEFAULT_DISPLAY_CURRENCY) params.set("display", display);
  if (filters.citySlug) params.set("city", filters.citySlug);
  if (filters.originalCurrency) params.set("currency", filters.originalCurrency);
  if (filters.minPrice !== undefined) params.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice !== undefined) params.set("maxPrice", String(filters.maxPrice));
  if (filters.minArea !== undefined) params.set("minArea", String(filters.minArea));
  if (filters.maxArea !== undefined) params.set("maxArea", String(filters.maxArea));

  const query = params.toString();
  return query ? `${LISTINGS_PATH}?${query}` : LISTINGS_PATH;
}

function rangeLabel(min: string | undefined, max: string | undefined): string {
  if (min && max) return `${min} – ${max}`;
  if (min) return `${min}-დან`;
  return `${max}-მდე`;
}

/** Chips for the filters that are applied, in a fixed order. Removing a chip keeps the display currency. */
export function getFilterChips(
  filters: ListingFilters,
  display: Currency = DEFAULT_DISPLAY_CURRENCY,
): FilterChip[] {
  const chips: FilterChip[] = [];
  const href = (next: ListingFilters) => buildListingsHref(next, display);

  const city = filters.citySlug ? findCityBySlug(filters.citySlug) : null;
  if (city) {
    chips.push({
      key: "city",
      label: `ქალაქი: ${city.name}`,
      removeHref: href({ ...filters, citySlug: undefined }),
    });
  }

  if (filters.originalCurrency) {
    chips.push({
      key: "originalCurrency",
      label: `ორიგინალი ვალუტა: ${filters.originalCurrency}`,
      removeHref: href({ ...filters, originalCurrency: undefined }),
    });
  }

  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    const min = filters.minPrice !== undefined ? formatMoney(filters.minPrice, display) : undefined;
    const max = filters.maxPrice !== undefined ? formatMoney(filters.maxPrice, display) : undefined;
    chips.push({
      key: "price",
      label: `ბიუჯეტი: ${rangeLabel(min, max)}`,
      removeHref: href({ ...filters, minPrice: undefined, maxPrice: undefined }),
    });
  }

  if (filters.minArea !== undefined || filters.maxArea !== undefined) {
    const min = filters.minArea !== undefined ? formatArea(filters.minArea) : undefined;
    const max = filters.maxArea !== undefined ? formatArea(filters.maxArea) : undefined;
    chips.push({
      key: "area",
      label: `ფართი: ${rangeLabel(min, max)}`,
      removeHref: href({ ...filters, minArea: undefined, maxArea: undefined }),
    });
  }

  return chips;
}

/** Link to a listing's detail page, keeping a non-default display currency. */
export function buildListingDetailHref(
  listingId: string,
  display: Currency = DEFAULT_DISPLAY_CURRENCY,
): string {
  const path = `${LISTINGS_PATH}/${encodeURIComponent(listingId)}`;
  return display === DEFAULT_DISPLAY_CURRENCY ? path : `${path}?display=${display}`;
}
