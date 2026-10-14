import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import type {
  Currency,
  ListingStatus,
  PropertyType,
  TransactionType,
} from "@/lib/properties/types";

/*
 * Synthetic fixtures for the asking-price statistics. They exist only in tests: invented
 * placeholder records ("synthetic-…"), never added to the demo inventory and not market data.
 */

export type FixtureOptions = {
  propertyId?: string;
  type?: PropertyType;
  transaction?: TransactionType;
  city?: string;
  district?: string;
  area?: number;
  price?: number;
  currency?: Currency;
  status?: ListingStatus;
};

export function synthetic(id: string, options: FixtureOptions = {}): ListingWithProperty {
  const {
    propertyId = `synthetic-property-${id}`,
    type = "apartment",
    transaction = "sale",
    city = "ქალაქი-ა",
    district = "უბანი-1",
    area = 100,
    price = 100000,
    currency = "USD",
    status = "active",
  } = options;
  const base = {
    id: `synthetic-listing-${id}`,
    propertyId,
    title: `სინთეზური ${id}`,
    askingPrice: { amount: price, currency },
    status,
    dataSource: "demo" as const,
  };
  return {
    listing:
      transaction === "rent"
        ? { ...base, transactionType: "rent", rentPeriod: "month" }
        : { ...base, transactionType: "sale" },
    property:
      type === "house"
        ? { id: propertyId, type, city, district, areaSqm: area, dataSource: "demo" }
        : { id: propertyId, type, city, district, areaSqm: area, dataSource: "demo" },
  };
}

/** `count` comparables with the given prices per m² (area 100 m², so price = perSqm × 100). */
export function comparablesWithPerSqm(
  perSqm: readonly number[],
  options: FixtureOptions = {},
): ListingWithProperty[] {
  return perSqm.map((value, index) =>
    synthetic(`c${index + 1}`, { area: 100, price: value * 100, ...options }),
  );
}
