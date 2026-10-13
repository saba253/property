import { DEFAULT_DISPLAY_CURRENCY } from "@/lib/currency/exchange-rate";
import { formatArea, formatMoney } from "@/lib/pricing/format-money";
import { getAmenityDefinition } from "@/lib/properties/amenities";
import { PROPERTY_TYPES } from "@/lib/properties/listing-types";
import { findCityBySlug } from "@/lib/properties/cities";
import {
  type ListingFilters,
  MAX_ROOMS_FILTER,
  getTransaction,
} from "@/lib/properties/listing-filters";
import { DEFAULT_LISTINGS_VIEW, type ListingsView } from "@/lib/properties/listings-view";
import type { AmenityKey, Currency } from "@/lib/properties/types";

const LISTINGS_PATH = "/properties";

/** One applied filter, shown as a removable chip. `removeHref` is the URL without it. */
export type FilterChip = {
  key:
    | "propertyType"
    | "city"
    | "originalCurrency"
    | "district"
    | "rooms"
    | "price"
    | "area"
    | "bedrooms"
    | "bathrooms"
    | "floor"
    | `amenity-${AmenityKey}`;
  label: string;
  removeHref: string;
};

/**
 * Builds a canonical `/properties` URL. Unset filters are left out, and so are the display
 * currency and the view when they are the defaults (USD, list), to keep shared links short.
 */
export function buildListingsHref(
  filters: ListingFilters,
  display: Currency = DEFAULT_DISPLAY_CURRENCY,
  view: ListingsView = DEFAULT_LISTINGS_VIEW,
): string {
  const params = new URLSearchParams();
  if (display !== DEFAULT_DISPLAY_CURRENCY) params.set("display", display);
  if (view !== DEFAULT_LISTINGS_VIEW) params.set("view", view);
  if (filters.transaction && filters.transaction !== "sale") {
    params.set("transaction", filters.transaction);
  }
  if (filters.propertyType) params.set("type", filters.propertyType);
  if (filters.citySlug) params.set("city", filters.citySlug);
  if (filters.originalCurrency) params.set("currency", filters.originalCurrency);
  if (filters.minPrice !== undefined) params.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice !== undefined) params.set("maxPrice", String(filters.maxPrice));
  if (filters.minArea !== undefined) params.set("minArea", String(filters.minArea));
  if (filters.maxArea !== undefined) params.set("maxArea", String(filters.maxArea));
  if (filters.district) params.set("district", filters.district);
  if (filters.rooms !== undefined) params.set("rooms", String(filters.rooms));
  if (filters.minBedrooms !== undefined) params.set("minBedrooms", String(filters.minBedrooms));
  if (filters.minBathrooms !== undefined) params.set("minBathrooms", String(filters.minBathrooms));
  if (filters.minFloor !== undefined) params.set("minFloor", String(filters.minFloor));
  if (filters.maxFloor !== undefined) params.set("maxFloor", String(filters.maxFloor));
  for (const amenity of filters.amenities ?? []) params.append("amenity", amenity);

  const query = params.toString();
  return query ? `${LISTINGS_PATH}?${query}` : LISTINGS_PATH;
}

function rangeLabel(min: string | undefined, max: string | undefined): string {
  if (min && max) return `${min} – ${max}`;
  if (min) return `${min}-დან`;
  return `${max}-მდე`;
}

/**
 * Chips for the filters that are applied, in a fixed order. Removing a chip keeps the display
 * currency and the view (list or map).
 */
export function getFilterChips(
  filters: ListingFilters,
  display: Currency = DEFAULT_DISPLAY_CURRENCY,
  view: ListingsView = DEFAULT_LISTINGS_VIEW,
): FilterChip[] {
  const chips: FilterChip[] = [];
  const href = (next: ListingFilters) => buildListingsHref(next, display, view);

  if (filters.propertyType) {
    chips.push({
      key: "propertyType",
      label: `ტიპი: ${PROPERTY_TYPES[filters.propertyType].label}`,
      removeHref: href({ ...filters, propertyType: undefined }),
    });
  }

  const city = filters.citySlug ? findCityBySlug(filters.citySlug) : null;
  if (city) {
    chips.push({
      key: "city",
      label: `ქალაქი: ${city.name}`,
      // The district belongs to the city, so removing the city removes the district too.
      removeHref: href({ ...filters, citySlug: undefined, district: undefined }),
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
    const isRent = getTransaction(filters) === "rent";
    chips.push({
      key: "price",
      label: isRent ? `ქირა: ${rangeLabel(min, max)} / თვე` : `ბიუჯეტი: ${rangeLabel(min, max)}`,
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

  if (filters.district) {
    chips.push({
      key: "district",
      label: `უბანი: ${filters.district}`,
      removeHref: href({ ...filters, district: undefined }),
    });
  }

  if (filters.rooms !== undefined) {
    chips.push({
      key: "rooms",
      label: `ოთახი: ${filters.rooms >= MAX_ROOMS_FILTER ? `${MAX_ROOMS_FILTER}+` : filters.rooms}`,
      removeHref: href({ ...filters, rooms: undefined }),
    });
  }

  if (filters.minBedrooms !== undefined) {
    chips.push({
      key: "bedrooms",
      label: `საძინებელი: ${filters.minBedrooms}+`,
      removeHref: href({ ...filters, minBedrooms: undefined }),
    });
  }

  if (filters.minBathrooms !== undefined) {
    chips.push({
      key: "bathrooms",
      label: `სველი წერტილი: ${filters.minBathrooms}+`,
      removeHref: href({ ...filters, minBathrooms: undefined }),
    });
  }

  if (filters.minFloor !== undefined || filters.maxFloor !== undefined) {
    const min = filters.minFloor !== undefined ? String(filters.minFloor) : undefined;
    const max = filters.maxFloor !== undefined ? String(filters.maxFloor) : undefined;
    chips.push({
      key: "floor",
      label: `სართული: ${rangeLabel(min, max)}`,
      removeHref: href({ ...filters, minFloor: undefined, maxFloor: undefined }),
    });
  }

  for (const amenity of filters.amenities ?? []) {
    const remaining = filters.amenities!.filter((key) => key !== amenity);
    chips.push({
      key: `amenity-${amenity}`,
      label: getAmenityDefinition(amenity).label,
      removeHref: href({ ...filters, amenities: remaining.length > 0 ? remaining : undefined }),
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
