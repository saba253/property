import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import type {
  AmenityKey,
  AmenityStatus,
  ListingEquipmentKey,
  PropertyFeatureKey,
} from "@/lib/properties/types";

export type AmenityGroup = "property" | "listing";

export type AmenityDefinition = {
  key: AmenityKey;
  /** Georgian label. */
  label: string;
  /** "property": building feature on Property. "listing": equipment included in the offer. */
  group: AmenityGroup;
};

/** All supported amenities, in display order. Add new ones here (and to the key types). */
export const AMENITIES: readonly AmenityDefinition[] = [
  { key: "balcony", label: "აივანი", group: "property" },
  { key: "parking", label: "პარკინგი", group: "property" },
  { key: "elevator", label: "ლიფტი", group: "property" },
  { key: "centralHeating", label: "ცენტრალური გათბობა", group: "property" },
  { key: "television", label: "ტელევიზორი", group: "listing" },
  { key: "bed", label: "საწოლი", group: "listing" },
  { key: "refrigerator", label: "მაცივარი", group: "listing" },
  { key: "washingMachine", label: "სარეცხი მანქანა", group: "listing" },
  { key: "airConditioning", label: "კონდიციონერი", group: "listing" },
  { key: "dishwasher", label: "ჭურჭლის სარეცხი მანქანა", group: "listing" },
];

export const AMENITY_GROUP_LABELS: Record<AmenityGroup, string> = {
  property: "შენობა და ბინა",
  listing: "ტექნიკა და ავეჯი",
};

const AMENITY_KEYS = new Set<string>(AMENITIES.map((amenity) => amenity.key));

export function isAmenityKey(value: string): value is AmenityKey {
  return AMENITY_KEYS.has(value);
}

export function getAmenityDefinition(key: AmenityKey): AmenityDefinition {
  return AMENITIES.find((amenity) => amenity.key === key)!;
}

/** Status of one amenity for a listing. Missing information is "unknown", never "no". */
export function getAmenityStatus(item: ListingWithProperty, key: AmenityKey): AmenityStatus {
  const definition = getAmenityDefinition(key);
  const status =
    definition.group === "property"
      ? item.property.features?.[key as PropertyFeatureKey]
      : item.listing.equipment?.[key as ListingEquipmentKey];
  return status ?? "unknown";
}

/** AND matching: true only when every requested amenity is confirmed ("yes"). */
export function hasAllAmenities(item: ListingWithProperty, keys: readonly AmenityKey[]): boolean {
  return keys.every((key) => getAmenityStatus(item, key) === "yes");
}

export type AmenitiesByStatus = Record<AmenityStatus, AmenityDefinition[]>;

/** Amenities of one group, split by status, each list in display order. */
export function groupAmenitiesByStatus(
  item: ListingWithProperty,
  group: AmenityGroup,
): AmenitiesByStatus {
  const result: AmenitiesByStatus = { yes: [], no: [], unknown: [] };
  for (const amenity of AMENITIES) {
    if (amenity.group === group) {
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
