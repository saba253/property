import type { ExchangeRateState } from "@/lib/currency/exchange-rate";
import { amenityAppliesTo, getAmenityDefinition } from "@/lib/properties/amenities";
import {
  type ListingFilters,
  MAX_ROOMS_FILTER,
  getTransaction,
  hasPriceFilter,
} from "@/lib/properties/listing-filters";
import type { SortOption } from "@/lib/properties/listing-sort";
import type { AmenityKey, Currency, PropertyType } from "@/lib/properties/types";

/*
 * SQL for the validated search (ListingFilters from parseListingFilters). It reproduces the
 * in-memory rules in lib/properties/listing-filters.ts and listing-sort.ts exactly; the parity
 * tests run both on the same data. Rules that must match:
 * - Only active listings of the chosen transaction type; unknown (NULL) facts never match.
 * - The budget compares the rounded display price: the original amount in its own currency, or
 *   floor(converted + 0.5) like Math.round, computed in double precision like JavaScript.
 *   Without a rate, listings in the other currency are not comparable (counted separately).
 * - Price sorts use unrounded USD (one rate); without a rate and with mixed currencies the default
 *   order is used and a notice is returned. Ties keep the insertion order (seq).
 * Only values travel as parameters; column names and keywords come from this file.
 */

export class SqlParams {
  readonly values: unknown[] = [];
  /** Adds a value and returns its placeholder ($1, $2, ...). */
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

export const LISTING_FROM = `
  FROM listings l
  JOIN properties p ON p.id = l.property_id
  JOIN cities c ON c.slug = p.city_slug`;

export const LISTING_COLUMNS = `
  l.id, l.property_id, l.title, l.transaction_type, l.rent_period,
  l.asking_amount::text AS asking_amount, l.asking_currency, l.status, l.data_source,
  p.type AS property_type, c.name AS city, p.district, p.area_sqm::text AS area_sqm,
  p.rooms, p.bedrooms, p.bathrooms, p.floor, p.total_floors, p.storeys,
  p.land_area_sqm::text AS land_area_sqm, p.location_precision, p.location_area_id,
  p.latitude::text AS latitude, p.longitude::text AS longitude,
  to_char(p.location_verified_on, 'YYYY-MM-DD') AS location_verified_on,
  p.data_source AS property_data_source`;

/** Amenity condition built from the definitions in lib/properties/amenities.ts. */
function amenityCondition(key: AmenityKey, params: SqlParams) {
  const definition = getAmenityDefinition(key);
  const types = (["apartment", "house"] as PropertyType[]).filter((type) =>
    amenityAppliesTo(definition, type),
  );
  const applies = `p.type = ANY(${params.add(types)}::text[])`;
  if (definition.key === "topFloor") {
    // Same rule as getTopFloorStatus: stated floor equal to the stated building height.
    return `(${applies} AND p.floor IS NOT NULL AND p.total_floors IS NOT NULL AND p.floor = p.total_floors)`;
  }
  const keyParam = params.add(definition.key);
  return definition.group === "property"
    ? `(${applies} AND EXISTS (SELECT 1 FROM property_features f WHERE f.property_id = p.id AND f.feature_key = ${keyParam} AND f.status = 'yes'))`
    : `(${applies} AND EXISTS (SELECT 1 FROM listing_equipment e WHERE e.listing_id = l.id AND e.equipment_key = ${keyParam} AND e.status = 'yes'))`;
}

/** WHERE conditions for every filter except the budget. */
export function filterConditions(
  filters: ListingFilters,
  dataSources: readonly string[],
  params: SqlParams,
): string[] {
  const conditions = [
    "l.status = 'active'",
    `l.data_source = ANY(${params.add(dataSources)}::text[])`,
    `l.transaction_type = ${params.add(getTransaction(filters))}`,
  ];
  if (filters.propertyType) conditions.push(`p.type = ${params.add(filters.propertyType)}`);
  if (filters.citySlug) conditions.push(`p.city_slug = ${params.add(filters.citySlug)}`);
  if (filters.district) conditions.push(`p.district = ${params.add(filters.district)}`);
  if (filters.originalCurrency) {
    conditions.push(`l.asking_currency = ${params.add(filters.originalCurrency)}`);
  }
  if (filters.minArea !== undefined) {
    conditions.push(`p.area_sqm::float8 >= ${params.add(filters.minArea)}::float8`);
  }
  if (filters.maxArea !== undefined) {
    conditions.push(`p.area_sqm::float8 <= ${params.add(filters.maxArea)}::float8`);
  }
  if (filters.rooms !== undefined) {
    conditions.push(
      filters.rooms >= MAX_ROOMS_FILTER
        ? `p.rooms >= ${params.add(MAX_ROOMS_FILTER)}::int`
        : `p.rooms = ${params.add(filters.rooms)}::int`,
    );
  }
  if (filters.minBedrooms !== undefined) {
    conditions.push(`p.bedrooms >= ${params.add(filters.minBedrooms)}::int`);
  }
  if (filters.minBathrooms !== undefined) {
    conditions.push(`p.bathrooms >= ${params.add(filters.minBathrooms)}::int`);
  }
  // Only apartments have a floor; a floor filter never matches a house.
  if (filters.minFloor !== undefined) {
    conditions.push(`(p.type = 'apartment' AND p.floor >= ${params.add(filters.minFloor)}::int)`);
  }
  if (filters.maxFloor !== undefined) {
    conditions.push(`(p.type = 'apartment' AND p.floor <= ${params.add(filters.maxFloor)}::int)`);
  }
  for (const key of filters.amenities ?? []) conditions.push(amenityCondition(key, params));
  return conditions;
}

/** The display price compared with the budget (NULL when it cannot be calculated). */
export function displayAmountSql(
  display: Currency,
  rateState: ExchangeRateState,
  params: SqlParams,
) {
  const same = `l.asking_currency = ${params.add(display)}`;
  if (rateState.status !== "available") {
    return `(CASE WHEN ${same} THEN l.asking_amount::float8 ELSE NULL END)`;
  }
  const rate = params.add(rateState.rate.gelPerUsd);
  // Mirrors convertAmount + roundToWholeUnits: USD→GEL multiplies, GEL→USD divides.
  return `(CASE WHEN ${same} THEN l.asking_amount::float8
    WHEN l.asking_currency = 'USD' THEN floor(l.asking_amount::float8 * ${rate}::float8 + 0.5)
    ELSE floor(l.asking_amount::float8 / ${rate}::float8 + 0.5) END)`;
}

/**
 * Budget condition and "not comparable" condition ("TRUE"/"FALSE" without a budget). The display
 * price SQL is only built when there is a budget, so no unused parameters are sent.
 */
export function priceConditions(
  filters: ListingFilters,
  display: Currency,
  rateState: ExchangeRateState,
  params: SqlParams,
) {
  if (!hasPriceFilter(filters)) return { priceOk: "TRUE", notComparable: "FALSE" };
  const amount = displayAmountSql(display, rateState, params);
  const parts = [`${amount} IS NOT NULL`];
  if (filters.minPrice !== undefined) {
    parts.push(`${amount} >= ${params.add(filters.minPrice)}::float8`);
  }
  if (filters.maxPrice !== undefined) {
    parts.push(`${amount} <= ${params.add(filters.maxPrice)}::float8`);
  }
  return { priceOk: `(${parts.join(" AND ")})`, notComparable: `(${amount} IS NULL)` };
}

/**
 * ORDER BY for a sort, or null when a price sort is impossible (mixed currencies, no rate).
 * `currencyCount` is the number of distinct original currencies among the matches.
 */
export function orderBySql(
  sort: SortOption,
  rateState: ExchangeRateState,
  currencyCount: number,
  params: SqlParams,
): string | null {
  if (sort === "default") return "l.seq ASC";
  const direction = sort.endsWith("_desc") ? "DESC" : "ASC";
  const measure = sort.replace(/_(asc|desc)$/, "");
  if (measure === "area") return `p.area_sqm::float8 ${direction}, l.seq ASC`;
  let price: string;
  if (rateState.status === "available") {
    price = `(CASE WHEN l.asking_currency = 'USD' THEN l.asking_amount::float8 ELSE l.asking_amount::float8 / ${params.add(rateState.rate.gelPerUsd)}::float8 END)`;
  } else if (currencyCount <= 1) {
    price = "l.asking_amount::float8";
  } else {
    return null;
  }
  const value = measure === "price" ? price : `(${price} / p.area_sqm::float8)`;
  return `${value} ${direction}, l.seq ASC`;
}
