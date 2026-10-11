import { formatArea } from "@/lib/pricing/format-money";
import type { Property } from "@/lib/properties/types";

/** One structural fact. `value` is null when the listing does not state it (unknown). */
export type StructuralFact = {
  label: string;
  value: string | null;
};

/** "5 / 12" when the building height is known, "5" otherwise, null when the floor is unknown. */
export function formatFloor(property: Property): string | null {
  if (property.floor === undefined) {
    return null;
  }
  return property.totalFloors === undefined
    ? String(property.floor)
    : `${property.floor} / ${property.totalFloors}`;
}

/**
 * Structural facts for the detail page, always in the same order. Unknown values are kept
 * (as null) so the page can say "not specified" instead of hiding or guessing them.
 */
export function getStructuralFacts(property: Property): StructuralFact[] {
  const count = (value: number | undefined) => (value === undefined ? null : String(value));
  return [
    { label: "ფართი", value: formatArea(property.areaSqm) },
    { label: "ოთახები", value: count(property.rooms) },
    { label: "საძინებლები", value: count(property.bedrooms) },
    { label: "სველი წერტილები", value: count(property.bathrooms) },
    { label: "სართული", value: formatFloor(property) },
  ];
}

/** Short facts for listing cards; unknown facts are simply left out to keep cards compact. */
export function getCardFacts(property: Property): string[] {
  const facts: string[] = [];
  if (property.rooms !== undefined) facts.push(`${property.rooms} ოთახი`);
  if (property.bedrooms !== undefined) {
    facts.push(property.bedrooms === 0 ? "საძინებლის გარეშე" : `${property.bedrooms} საძინებელი`);
  }
  facts.push(formatArea(property.areaSqm));
  const floor = formatFloor(property);
  if (floor !== null) facts.push(`სართული ${floor}`);
  return facts;
}
