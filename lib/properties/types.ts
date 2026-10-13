export type Currency = "USD" | "GEL";

/**
 * An amount in its original currency. Stored values are never converted; conversions to
 * another currency are only calculated for display (see lib/pricing/display-price.ts).
 */
export type Money = {
  amount: number;
  currency: Currency;
};

/**
 * Where data comes from. "demo": invented examples. "local-draft": a listing someone is preparing
 * in their browser on /properties/new; it is never published, stored or listed anywhere.
 * Adding "real" later will be a deliberate change.
 */
export type DataSource = "demo" | "local-draft";

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
export type PropertyFeatureKey =
  | "balcony"
  | "parking"
  | "garage"
  | "elevator"
  | "centralHeating"
  | "naturalGas"
  | "basement"
  | "storageRoom"
  | "builtInKitchen";

/** Movable equipment included in a particular offer. It belongs to the Listing. */
export type ListingEquipmentKey =
  | "furniture"
  | "television"
  | "bed"
  | "refrigerator"
  | "washingMachine"
  | "airConditioning"
  | "dishwasher";

/**
 * Characteristics calculated from other facts instead of being stored, so they can never
 * contradict them. "topFloor" comes from an apartment's `floor` and `totalFloors`.
 */
export type DerivedAmenityKey = "topFloor";

export type AmenityKey = PropertyFeatureKey | ListingEquipmentKey | DerivedAmenityKey;

/** A point on the map in WGS 84 degrees. */
export type GeoPoint = { lat: number; lng: number };

/**
 * Where a property is, and how precisely that is known. Exact coordinates and area-level
 * positions are kept apart on purpose:
 * - "exact": verified coordinates of the property itself. Demo data never uses this.
 * - "approximate": only the area (district) is known. The map shows the area's reference point
 *   (see lib/geo/area-reference.ts), never a particular building, and labels it as approximate.
 * - "unknown": no trustworthy location for the map; the listing stays in the results list.
 */
export type PropertyLocation =
  | { precision: "exact"; point: GeoPoint; verifiedOn: string }
  | { precision: "approximate"; areaId: string }
  | { precision: "unknown" };

export type LocationPrecision = PropertyLocation["precision"];

/** Facts shared by every property type. */
type PropertyBase = {
  id: string;
  city: string;
  district: string;
  /** Usable floor area in m² (for a house: the house itself, not the plot). */
  areaSqm: number;
  /** Map location and its precision. Missing means unknown (no pin is shown). */
  location?: PropertyLocation;
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

/**
 * Original illustrated scenes used as demo images. They are drawings, never photos, and are
 * always labelled as illustrations wherever they are shown.
 */
export type IllustrationScene =
  | "building-exterior"
  | "house-exterior"
  | "living-room"
  | "kitchen"
  | "bedroom"
  | "bathroom"
  | "balcony-view"
  | "yard";

/**
 * Where an image comes from. "illustration" is an original SVG drawing rendered in the app.
 * "photo" is a real image file: today only local browser previews in the draft listing form
 * (object URLs that are never uploaded); later, uploaded photos stored by the platform.
 */
export type ListingImageSource =
  | { kind: "illustration"; scene: IllustrationScene }
  | { kind: "photo"; src: string; width?: number; height?: number };

/**
 * One image of a listing.
 *
 * Ownership: images belong to the Listing, not to the Property. Photos show the property as it
 * was offered at that time (furniture, renovation, season), so a later sale or rental of the
 * same physical property brings its own image set. Images are kept in their own collection,
 * keyed by `listingId`, like a future database table.
 */
export type ListingImage = {
  id: string;
  listingId: string;
  /** Display position, lowest first. Ties are broken by `id` so the order is always stable. */
  order: number;
  /** Marks the cover image. Without one, the first image by `order` is the cover. */
  isCover?: boolean;
  /** Required descriptive alternative text (Georgian). */
  alt: string;
  /** Optional short caption shown in the photo viewer. */
  caption?: string;
  source: ListingImageSource;
};
