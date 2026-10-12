import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import type {
  AmenityKey,
  AmenityStatus,
  ListingEquipmentKey,
  Property,
  PropertyFeatureKey,
  PropertyType,
} from "@/lib/properties/types";

export type AmenityGroup = "property" | "listing";

export type AmenityDefinition = {
  key: AmenityKey;
  /** Georgian label. */
  label: string;
  /** "property": characteristic of the Property. "listing": equipment included in the offer. */
  group: AmenityGroup;
  /** Property types this amenity applies to. Omitted means every property type. */
  appliesTo?: readonly PropertyType[];
  /** Calculated from other facts rather than stored (see DerivedAmenityKey). */
  derived?: boolean;
};

/**
 * All supported characteristics, in display order. Add new ones here and to the key types in
 * lib/properties/types.ts; listing forms, filters and detail pages pick them up from this list.
 */
export const AMENITIES: readonly AmenityDefinition[] = [
  { key: "balcony", label: "აივანი", group: "property" },
  { key: "parking", label: "პარკინგი", group: "property" },
  { key: "garage", label: "გარაჟი", group: "property" },
  // A private house has no shared elevator, so it is never shown or matched for houses.
  { key: "elevator", label: "ლიფტი", group: "property", appliesTo: ["apartment"] },
  { key: "centralHeating", label: "ცენტრალური გათბობა", group: "property" },
  { key: "naturalGas", label: "ბუნებრივი აირი", group: "property" },
  { key: "basement", label: "სარდაფი", group: "property" },
  { key: "storageRoom", label: "სათავსო", group: "property" },
  { key: "builtInKitchen", label: "ჩაშენებული სამზარეულო", group: "property" },
  {
    key: "topFloor",
    label: "ბოლო სართული",
    group: "property",
    appliesTo: ["apartment"],
    derived: true,
  },
  { key: "furniture", label: "ავეჯი", group: "listing" },
  { key: "television", label: "ტელევიზორი", group: "listing" },
  { key: "bed", label: "საწოლი", group: "listing" },
  { key: "refrigerator", label: "მაცივარი", group: "listing" },
  { key: "washingMachine", label: "სარეცხი მანქანა", group: "listing" },
  { key: "airConditioning", label: "კონდიციონერი", group: "listing" },
  { key: "dishwasher", label: "ჭურჭლის სარეცხი მანქანა", group: "listing" },
];

export const AMENITY_GROUP_LABELS: Record<AmenityGroup, string> = {
  property: "ქონების მახასიათებლები",
  listing: "ავეჯი და ტექნიკა",
};

const AMENITY_KEYS = new Set<string>(AMENITIES.map((amenity) => amenity.key));

export function isAmenityKey(value: string): value is AmenityKey {
  return AMENITY_KEYS.has(value);
}

export function getAmenityDefinition(key: AmenityKey): AmenityDefinition {
  return AMENITIES.find((amenity) => amenity.key === key)!;
}

/** True when the amenity is relevant for the property type (for example, no elevator for houses). */
export function amenityAppliesTo(amenity: AmenityDefinition, type: PropertyType): boolean {
  return amenity.appliesTo === undefined || amenity.appliesTo.includes(type);
}

/**
 * Whether an apartment is on the top floor, derived from `floor` and `totalFloors`. Unknown when
 * either is missing, when the data is inconsistent, or for non-apartments.
 */
export function getTopFloorStatus(property: Property): AmenityStatus {
  if (property.type !== "apartment") return "unknown";
  const { floor, totalFloors } = property;
  if (floor === undefined || totalFloors === undefined || floor > totalFloors) return "unknown";
  return floor === totalFloors ? "yes" : "no";
}

/** Status of one amenity for a listing. Missing information is "unknown", never "no". */
export function getAmenityStatus(item: ListingWithProperty, key: AmenityKey): AmenityStatus {
  if (key === "topFloor") {
    return getTopFloorStatus(item.property);
  }
  const definition = getAmenityDefinition(key);
  const status =
    definition.group === "property"
      ? item.property.features?.[key as PropertyFeatureKey]
      : item.listing.equipment?.[key as ListingEquipmentKey];
  return status ?? "unknown";
}

/**
 * AND matching: true only when every requested amenity applies to the property type and is
 * confirmed ("yes").
 */
export function hasAllAmenities(item: ListingWithProperty, keys: readonly AmenityKey[]): boolean {
  return keys.every(
    (key) =>
      amenityAppliesTo(getAmenityDefinition(key), item.property.type) &&
      getAmenityStatus(item, key) === "yes",
  );
}

export type AmenitiesByStatus = Record<AmenityStatus, AmenityDefinition[]>;

/** Applicable amenities of one group, split by status, each list in display order. */
export function groupAmenitiesByStatus(
  item: ListingWithProperty,
  group: AmenityGroup,
): AmenitiesByStatus {
  const result: AmenitiesByStatus = { yes: [], no: [], unknown: [] };
  for (const amenity of AMENITIES) {
    if (amenity.group === group && amenityAppliesTo(amenity, item.property.type)) {
      result[getAmenityStatus(item, amenity.key)].push(amenity);
    }
  }
  return result;
}

/** Sorts and de-duplicates amenity keys into display order, for stable URLs. */
export function normalizeAmenityKeys(keys: readonly AmenityKey[]): AmenityKey[] {
  const wanted = new Set(keys);
  return AMENITIES.map((amenity) => amenity.key).filter((key) => wanted.has(key));
}
