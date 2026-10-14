import type { ExchangeRateState } from "@/lib/currency/exchange-rate";
import { PRECISION_LABELS, resolveMapPosition } from "@/lib/geo/location";
import { getListingDisplayPrice } from "@/lib/pricing/display-price";
import {
  formatDisplayAmount,
  formatDisplayPricePerSqm,
  periodSuffix,
} from "@/lib/pricing/format-display-price";
import { formatArea, formatMoney } from "@/lib/pricing/format-money";
import { AMENITIES, amenityAppliesTo, getAmenityStatus } from "@/lib/properties/amenities";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import { PROPERTY_TYPES, TRANSACTION_TYPES, getPricePeriod } from "@/lib/properties/listing-types";
import { comparableMeasure, priceComparisonCurrency } from "@/lib/properties/listing-sort";
import { formatFloor } from "@/lib/properties/property-facts";
import type {
  AmenityKey,
  AmenityStatus,
  Currency,
  ListingImage,
  TransactionType,
} from "@/lib/properties/types";

/*
 * Side-by-side comparison of listings, as plain data. Everything is built from the existing
 * price, fact and amenity functions, so the comparison always matches cards and detail pages.
 * Cells distinguish four cases: a value (or yes), "no", "not specified" and "not applicable".
 */

export type CompareCell =
  | { kind: "value"; text: string }
  | { kind: "amenity"; status: AmenityStatus }
  | { kind: "unknown" }
  | { kind: "not-applicable" };

export type ComparisonRowKey =
  | "propertyType"
  | "transaction"
  | "place"
  | "price"
  | "originalPrice"
  | "pricePerSqm"
  | "area"
  | "rooms"
  | "bedrooms"
  | "bathrooms"
  | "floor"
  | "storeys"
  | "landArea"
  | "location"
  | `amenity-${AmenityKey}`;

export type ComparisonRow = {
  key: ComparisonRowKey;
  label: string;
  group: "summary" | "price" | "facts" | "characteristics";
};

const FIXED_ROWS: readonly ComparisonRow[] = [
  { key: "propertyType", label: "ქონების ტიპი", group: "summary" },
  { key: "transaction", label: "გარიგების ტიპი", group: "summary" },
  { key: "place", label: "მდებარეობა", group: "summary" },
  { key: "price", label: "ფასი", group: "price" },
  { key: "originalPrice", label: "ორიგინალი ფასი და ვალუტა", group: "price" },
  { key: "pricePerSqm", label: "ფასი მ²-ზე", group: "price" },
  { key: "area", label: "ფართი", group: "facts" },
  { key: "rooms", label: "ოთახები", group: "facts" },
  { key: "bedrooms", label: "საძინებლები", group: "facts" },
  { key: "bathrooms", label: "სველი წერტილები", group: "facts" },
  { key: "floor", label: "სართული (ბინა)", group: "facts" },
  { key: "storeys", label: "სართულიანობა (სახლი)", group: "facts" },
  { key: "landArea", label: "ეზოს ფართი (სახლი)", group: "facts" },
  { key: "location", label: "მდებარეობის სიზუსტე", group: "facts" },
];

/** All rows in display order: summary, price, facts, then every characteristic. */
export const COMPARISON_ROWS: readonly ComparisonRow[] = [
  ...FIXED_ROWS,
  ...AMENITIES.map((amenity) => ({
    key: `amenity-${amenity.key}` as const,
    label: amenity.label,
    group: "characteristics" as const,
  })),
];

export const ROW_GROUP_LABELS: Record<ComparisonRow["group"], string> = {
  summary: "მიმოხილვა",
  price: "ფასი",
  facts: "ქონების მონაცემები",
  characteristics: "მახასიათებლები",
};

export type ComparisonColumn = {
  id: string;
  title: string;
  href: string;
  coverImage: ListingImage | null;
  transaction: TransactionType;
  cells: Record<ComparisonRowKey, CompareCell>;
  /**
   * Plain numbers for highlighting the lowest/highest value, in one comparison currency (not
   * rounded). null when a value cannot be compared honestly (for example no exchange rate).
   */
  numbers: { price: number | null; pricePerSqm: number | null; area: number | null };
};

const value = (text: string): CompareCell => ({ kind: "value", text });
const countCell = (count: number | undefined): CompareCell =>
  count === undefined ? { kind: "unknown" } : value(String(count));

/**
 * One column per listing. `display` is the currency for showing prices; the original price is
 * always shown as well. Rental prices keep "/ თვე" (and "/ მ² / თვე" per square metre).
 */
export function buildComparisonColumns(
  items: readonly ListingWithProperty[],
  details: (item: ListingWithProperty) => {
    href: string;
    coverImage: ListingImage | null;
  },
  display: Currency,
  rateState: ExchangeRateState,
): ComparisonColumn[] {
  const comparisonCurrency = priceComparisonCurrency(items, rateState);

  return items.map((item) => {
    const { listing, property } = item;
    const price = getListingDisplayPrice(item, display, rateState);
    const perSqm = formatDisplayPricePerSqm(price);
    const period = getPricePeriod(listing);
    const isApartment = property.type === "apartment";
    const floorText = isApartment ? formatFloor(property) : null;
    const position = resolveMapPosition(property);

    const cells = {
      propertyType: value(PROPERTY_TYPES[property.type].label),
      transaction: value(TRANSACTION_TYPES[listing.transactionType].label),
      place: value(`${property.city}, ${property.district}`),
      price: value(formatDisplayAmount(price)),
      originalPrice: value(
        `${formatMoney(listing.askingPrice.amount, listing.askingPrice.currency)}${periodSuffix(period)} (${listing.askingPrice.currency})`,
      ),
      pricePerSqm: perSqm === null ? { kind: "unknown" } : value(perSqm),
      area: value(formatArea(property.areaSqm)),
      rooms: countCell(property.rooms),
      bedrooms: countCell(property.bedrooms),
      bathrooms: countCell(property.bathrooms),
      floor: !isApartment
        ? { kind: "not-applicable" }
        : floorText === null
          ? { kind: "unknown" }
          : value(floorText),
      storeys: property.type === "house" ? countCell(property.storeys) : { kind: "not-applicable" },
      landArea:
        property.type === "house"
          ? property.landAreaSqm === undefined
            ? { kind: "unknown" }
            : value(formatArea(property.landAreaSqm))
          : { kind: "not-applicable" },
      location: value(PRECISION_LABELS[position?.precision ?? "unknown"]),
    } as Record<ComparisonRowKey, CompareCell>;

    for (const amenity of AMENITIES) {
      cells[`amenity-${amenity.key}`] = amenityAppliesTo(amenity, property.type)
        ? { kind: "amenity", status: getAmenityStatus(item, amenity.key) }
        : { kind: "not-applicable" };
    }

    const numeric = (measure: "price" | "price_per_sqm") =>
      comparisonCurrency === null
        ? null
        : comparableMeasure(item, measure, comparisonCurrency, rateState);

    return {
      id: listing.id,
      title: listing.title,
      ...details(item),
      transaction: listing.transactionType,
      cells,
      numbers: {
        price: numeric("price"),
        pricePerSqm: numeric("price_per_sqm"),
        area: comparableMeasure(item, "area", "USD", rateState),
      },
    };
  });
}

/** Rows to show: rows that are "not applicable" for every compared listing are hidden. */
export function visibleRows(columns: readonly ComparisonColumn[]): ComparisonRow[] {
  return COMPARISON_ROWS.filter((row) =>
    columns.some((column) => column.cells[row.key].kind !== "not-applicable"),
  );
}

export type Extremes = { lowest: string[]; highest: string[] };

/**
 * Listings with the lowest and highest value of a number, for a neutral highlight. Nothing is
 * highlighted when any value cannot be compared or when all values are equal. Lowest does not
 * mean best: asking prices are not verified prices or market values.
 */
export function findExtremes(
  columns: readonly ComparisonColumn[],
  key: keyof ComparisonColumn["numbers"],
): Extremes | null {
  if (columns.length < 2) return null;
  const numbers = columns.map((column) => column.numbers[key]);
  if (numbers.some((number) => number === null)) return null;
  const values = numbers as number[];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return null;
  return {
    lowest: columns.filter((_, index) => values[index] === min).map((column) => column.id),
    highest: columns.filter((_, index) => values[index] === max).map((column) => column.id),
  };
}

export const CELL_TEXT = {
  unknown: "არ არის მითითებული",
  "not-applicable": "არ გამოიყენება",
  yes: "არის",
  no: "არ არის",
} as const;
