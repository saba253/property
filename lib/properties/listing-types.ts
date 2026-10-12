import type { Listing, PropertyType, RentPeriod, TransactionType } from "@/lib/properties/types";

/** Compile-time exhaustiveness check for switches over union types. */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

export type PropertyTypeDefinition = {
  /** Georgian label. */
  label: string;
  /** Apartments are on a floor of a building; houses are not. */
  hasFloor: boolean;
  /** Houses have a number of storeys. */
  hasStoreys: boolean;
  /** Houses can have a plot or yard area. */
  hasLandArea: boolean;
  /** Homes have rooms, bedrooms and bathrooms; future land plots will not. */
  hasRooms: boolean;
};

/**
 * Registry of property types and the facts that apply to each. Future types (land plots,
 * commercial property) get an entry here, so apartment-only facts and filters are never
 * applied to them by accident.
 */
export const PROPERTY_TYPES: Record<PropertyType, PropertyTypeDefinition> = {
  apartment: {
    label: "ბინა",
    hasFloor: true,
    hasStoreys: false,
    hasLandArea: false,
    hasRooms: true,
  },
  house: {
    label: "კერძო სახლი",
    hasFloor: false,
    hasStoreys: true,
    hasLandArea: true,
    hasRooms: true,
  },
};

/** Display order of property types in filters. */
export const PROPERTY_TYPE_ORDER: readonly PropertyType[] = ["apartment", "house"];

export const TRANSACTION_TYPES: Record<TransactionType, { label: string }> = {
  sale: { label: "იყიდება" },
  rent: { label: "ქირავდება" },
};

export const TRANSACTION_TYPE_ORDER: readonly TransactionType[] = ["sale", "rent"];

/** For Sale is the default; there is deliberately no "all" option (see listing filters). */
export const DEFAULT_TRANSACTION_TYPE: TransactionType = "sale";

export function isPropertyType(value: string): value is PropertyType {
  return Object.hasOwn(PROPERTY_TYPES, value);
}

export function isTransactionType(value: string): value is TransactionType {
  return Object.hasOwn(TRANSACTION_TYPES, value);
}

/** The period a listing's price refers to: null for a sale price, "month" for monthly rent. */
export function getPricePeriod(listing: Listing): RentPeriod | null {
  switch (listing.transactionType) {
    case "sale":
      return null;
    case "rent":
      return listing.rentPeriod;
    default:
      return assertNever(listing);
  }
}
