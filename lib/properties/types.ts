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
 * Supported property types. Land plots and commercial property are planned: add them here,
 * as their own Property variant, and in lib/properties/listing-types.ts. Exhaustive switches
 * (assertNever) then point to every place that must handle the new type.
 */
export type PropertyType = "apartment" | "house";

/** Whether a listing offers the property for sale or for rent. */
export type TransactionType = "sale" | "rent";

/** Rental price period. Only monthly rent is supported for now. */
export type RentPeriod = "month";

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

/** Facts shared by every property type. */
type PropertyBase = {
  id: string;
  city: string;
  district: string;
  /** Usable floor area in m² (for a house: the house itself, not the plot). */
  areaSqm: number;
  /** Building and apartment features; a missing key means unknown. */
  features?: Partial<Record<PropertyFeatureKey, AmenityStatus>>;
  dataSource: DataSource;
};

/** Facts for homes (apartments and houses). Future land plots will not have these. */
type ResidentialFacts = {
  /** Total number of rooms (Georgian listings count living rooms and bedrooms). Optional. */
  rooms?: number;
  /** Number of bedrooms; distinct from total rooms. 0 is valid (studio). Optional. */
  bedrooms?: number;
  /** Number of bathrooms. Optional. */
  bathrooms?: number;
};

export type ApartmentProperty = PropertyBase &
  ResidentialFacts & {
    type: "apartment";
    /** Floor the apartment is on. Optional. */
    floor?: number;
    /** Total floors in the building, when known. Optional. */
    totalFloors?: number;
  };

export type HouseProperty = PropertyBase &
  ResidentialFacts & {
    type: "house";
    /** Number of storeys of the house. Optional. */
    storeys?: number;
    /** Area of the plot or yard in m², when known. Optional. */
    landAreaSqm?: number;
  };

/** The physical thing: facts about the building, apartment, or house itself. */
export type Property = ApartmentProperty | HouseProperty;

export type ListingStatus = "active" | "inactive";

type ListingBase = {
  id: string;
  propertyId: string;
  title: string;
  /** Original asking price. For rent, this is the price per `rentPeriod`. */
  askingPrice: Money;
  status: ListingStatus;
  /** Movable equipment included in this offer; a missing key means unknown. */
  equipment?: Partial<Record<ListingEquipmentKey, AmenityStatus>>;
  dataSource: DataSource;
};

export type SaleListing = ListingBase & { transactionType: "sale" };

export type RentListing = ListingBase & { transactionType: "rent"; rentPeriod: RentPeriod };

/** An offer for a property (sale or rent). One property can have several listings over time. */
export type Listing = SaleListing | RentListing;
