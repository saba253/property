export type Currency = "USD" | "GEL";

/**
 * An amount in its original currency. Stored values are never converted; conversions to
 * another currency are only calculated for display (see lib/pricing/display-price.ts).
 */
export type Money = {
  amount: number;
  currency: Currency;
};

/** Only "demo" exists for now. Adding "real" later will be a deliberate change. */
export type DataSource = "demo";

/**
 * Three-state amenity information. "unknown" means the source did not say; it must never be
 * read as "no". A missing key in an amenity record also means "unknown".
 */
export type AmenityStatus = "yes" | "no" | "unknown";

/** Relatively permanent building or apartment features. They belong to the Property. */
export type PropertyFeatureKey = "balcony" | "parking" | "elevator" | "centralHeating";

/** Movable equipment included in a particular offer. It belongs to the Listing. */
export type ListingEquipmentKey =
  "television" | "bed" | "refrigerator" | "washingMachine" | "airConditioning" | "dishwasher";

export type AmenityKey = PropertyFeatureKey | ListingEquipmentKey;

/** The physical thing: facts about the building or apartment itself. */
export type Property = {
  id: string;
  city: string;
  district: string;
  areaSqm: number;
  /** Total number of rooms (Georgian listings count living rooms and bedrooms). Optional. */
  rooms?: number;
  /** Number of bedrooms; distinct from total rooms. 0 is valid (studio). Optional. */
  bedrooms?: number;
  /** Number of bathrooms. Optional. */
  bathrooms?: number;
  /** Floor the apartment is on. Optional. */
  floor?: number;
  /** Total floors in the building, when known. Optional. */
  totalFloors?: number;
  /** Building and apartment features; a missing key means unknown. */
  features?: Partial<Record<PropertyFeatureKey, AmenityStatus>>;
  dataSource: DataSource;
};

export type ListingStatus = "active" | "inactive";

/** An offer to sell a property. One property can have several listings over time. */
export type Listing = {
  id: string;
  propertyId: string;
  title: string;
  askingPrice: Money;
  status: ListingStatus;
  /** Movable equipment included in this offer; a missing key means unknown. */
  equipment?: Partial<Record<ListingEquipmentKey, AmenityStatus>>;
  dataSource: DataSource;
};
