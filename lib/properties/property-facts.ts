import { formatArea } from "@/lib/pricing/format-money";
import { assertNever } from "@/lib/properties/listing-types";
import type { ApartmentProperty, HouseProperty, Property } from "@/lib/properties/types";

/** One structural fact. `value` is null when the listing does not state it (unknown). */
export type StructuralFact = {
  label: string;
  value: string | null;
};

const count = (value: number | undefined) => (value === undefined ? null : String(value));

/** "5 / 12" when the building height is known, "5" otherwise, null when the floor is unknown. */
export function formatFloor(property: ApartmentProperty): string | null {
  if (property.floor === undefined) {
    return null;
  }
  return property.totalFloors === undefined
    ? String(property.floor)
    : `${property.floor} / ${property.totalFloors}`;
}

/**
 * Structural facts for the detail page, in a fixed order per property type. Facts that do not
 * apply to a type are never listed (a house has no floor; an apartment has no plot). Unknown
 * values are kept (as null) so the page can say "not specified" instead of hiding or guessing.
 */
export function getStructuralFacts(property: Property): StructuralFact[] {
  switch (property.type) {
    case "apartment":
      return [
        { label: "ფართი", value: formatArea(property.areaSqm) },
        { label: "ოთახები", value: count(property.rooms) },
        { label: "საძინებლები", value: count(property.bedrooms) },
        { label: "სველი წერტილები", value: count(property.bathrooms) },
        { label: "სართული", value: formatFloor(property) },
      ];
    case "house":
      return [
        { label: "სახლის ფართი", value: formatArea(property.areaSqm) },
        {
          label: "ეზოს ფართი",
          value: property.landAreaSqm === undefined ? null : formatArea(property.landAreaSqm),
        },
        { label: "ოთახები", value: count(property.rooms) },
        { label: "საძინებლები", value: count(property.bedrooms) },
        { label: "სველი წერტილები", value: count(property.bathrooms) },
        { label: "სართულიანობა", value: count(property.storeys) },
      ];
    default:
      return assertNever(property);
  }
}

function houseCardFacts(property: HouseProperty): string[] {
  const facts: string[] = [];
  if (property.storeys !== undefined) facts.push(`${property.storeys}-სართულიანი`);
  if (property.landAreaSqm !== undefined) facts.push(`ეზო ${formatArea(property.landAreaSqm)}`);
  return facts;
}

/** Short facts for listing cards; unknown facts are simply left out to keep cards compact. */
export function getCardFacts(property: Property): string[] {
  const facts: string[] = [];
  if (property.rooms !== undefined) facts.push(`${property.rooms} ოთახი`);
  if (property.bedrooms !== undefined) {
    facts.push(property.bedrooms === 0 ? "საძინებლის გარეშე" : `${property.bedrooms} საძინებელი`);
  }
  facts.push(formatArea(property.areaSqm));

  switch (property.type) {
    case "apartment": {
      const floor = formatFloor(property);
      if (floor !== null) facts.push(`სართული ${floor}`);
      return facts;
    }
    case "house":
      return [...facts, ...houseCardFacts(property)];
    default:
      return assertNever(property);
  }
}
