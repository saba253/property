import { formatArea, formatMoney } from "@/lib/pricing/format-money";
import { findCityBySlug } from "@/lib/properties/cities";
import type { ListingFilters } from "@/lib/properties/listing-filters";

const LISTINGS_PATH = "/properties";

/** One applied filter, shown as a removable chip. `removeHref` is the URL without it. */
export type FilterChip = {
  key: "city" | "currency" | "price" | "area";
  label: string;
  removeHref: string;
};

/** Builds a canonical `/properties` URL for the filters. Unset filters are left out. */
export function buildListingsHref(filters: ListingFilters): string {
  const params = new URLSearchParams();
  if (filters.citySlug) params.set("city", filters.citySlug);
  if (filters.currency) params.set("currency", filters.currency);
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

/**
 * Chips for the filters that are applied, in a fixed order. Removing the currency also removes
 * the price range, because price limits only make sense within one currency.
 */
export function getFilterChips(filters: ListingFilters): FilterChip[] {
  const chips: FilterChip[] = [];

  const city = filters.citySlug ? findCityBySlug(filters.citySlug) : null;
  if (city) {
    chips.push({
      key: "city",
      label: `ქალაქი: ${city.name}`,
      removeHref: buildListingsHref({ ...filters, citySlug: undefined }),
    });
  }

  const { currency } = filters;
  if (currency) {
    chips.push({
      key: "currency",
      label: `ვალუტა: ${currency}`,
      removeHref: buildListingsHref({
        ...filters,
        currency: undefined,
        minPrice: undefined,
        maxPrice: undefined,
      }),
    });

    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      const min =
        filters.minPrice !== undefined ? formatMoney(filters.minPrice, currency) : undefined;
      const max =
        filters.maxPrice !== undefined ? formatMoney(filters.maxPrice, currency) : undefined;
      chips.push({
        key: "price",
        label: `ფასი: ${rangeLabel(min, max)}`,
        removeHref: buildListingsHref({ ...filters, minPrice: undefined, maxPrice: undefined }),
      });
    }
  }

  if (filters.minArea !== undefined || filters.maxArea !== undefined) {
    const min = filters.minArea !== undefined ? formatArea(filters.minArea) : undefined;
    const max = filters.maxArea !== undefined ? formatArea(filters.maxArea) : undefined;
    chips.push({
      key: "area",
      label: `ფართი: ${rangeLabel(min, max)}`,
      removeHref: buildListingsHref({ ...filters, minArea: undefined, maxArea: undefined }),
    });
  }

  return chips;
}
