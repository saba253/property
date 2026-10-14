import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";

/*
 * Comparable listings for the asking-price context on detail pages.
 *
 * A comparable is another ACTIVE offer (listing status from the data model) of a different
 * physical property with the same transaction type (and rent period), the same property type
 * and the same city, a valid positive asking price and area, and an area within ±25% of the
 * subject's area. Same-district comparables are preferred; only when there are too few does the
 * comparison widen to the whole city, and the result says so. Cities, transaction types and
 * property types are never mixed, and the rules are never loosened to reach a minimum.
 *
 * Today the candidates are the demo listings in memory. With a real database this selection
 * becomes one indexed query (transaction, type, city, status, area range; district first),
 * returning only the matching rows, never the whole inventory.
 */

/** Allowed relative difference in floor area: ±25% of the subject's area, boundaries included. */
export const AREA_TOLERANCE = 0.25;

/** Fewer comparables than this give no statistics at all. */
export const MIN_COMPARABLES = 5;

export type ComparableScope = "district" | "city";

export type ComparableSelection =
  | {
      status: "enough";
      scope: ComparableScope;
      /** Comparables in a stable order (by listing id), one per physical property. */
      comparables: ListingWithProperty[];
      districtCount: number;
      cityCount: number;
    }
  | {
      status: "insufficient";
      /** Eligible comparables in the subject's district (0 when its district is unknown). */
      districtCount: number;
      /** Eligible comparables in the whole city (includes the district ones). */
      cityCount: number;
    }
  | { status: "invalid-subject" };

const isPositive = (value: number) => Number.isFinite(value) && value > 0;

/** The subject's comparable area range in m² (inclusive). */
export function areaRange(subjectAreaSqm: number, tolerance = AREA_TOLERANCE) {
  return { min: subjectAreaSqm * (1 - tolerance), max: subjectAreaSqm * (1 + tolerance) };
}

/** True when `areaSqm` is within ±tolerance of the subject's area, boundaries included. */
export function isWithinAreaRange(
  subjectAreaSqm: number,
  areaSqm: number,
  tolerance = AREA_TOLERANCE,
): boolean {
  const { min, max } = areaRange(subjectAreaSqm, tolerance);
  return areaSqm >= min && areaSqm <= max;
}

/** A district name that can be matched; blank means unknown. */
function knownDistrict(district: string): string | null {
  const trimmed = district.trim();
  return trimmed === "" ? null : trimmed;
}

/** Valid asking price and floor area: both finite and greater than zero. */
export function hasValidPriceAndArea({ listing, property }: ListingWithProperty): boolean {
  return isPositive(listing.askingPrice.amount) && isPositive(property.areaSqm);
}

/** Every rule except the district: same offer kind, same type and city, similar area. */
function isEligible(subject: ListingWithProperty, candidate: ListingWithProperty): boolean {
  const { listing, property } = candidate;
  if (listing.id === subject.listing.id) return false;
  // Another offer of the same physical property is the same evidence, not a comparable.
  if (listing.propertyId === subject.listing.propertyId) return false;
  if (property.id === subject.property.id) return false;
  if (listing.status !== "active") return false;
  if (listing.transactionType !== subject.listing.transactionType) return false;
  if (
    listing.transactionType === "rent" &&
    subject.listing.transactionType === "rent" &&
    listing.rentPeriod !== subject.listing.rentPeriod
  ) {
    return false;
  }
  if (property.type !== subject.property.type) return false;
  if (property.city.trim() !== subject.property.city.trim()) return false;
  if (!hasValidPriceAndArea(candidate)) return false;
  return isWithinAreaRange(subject.property.areaSqm, property.areaSqm);
}

/**
 * Selects comparables for `subject` from `candidates` (not modified). Deterministic: the same
 * data in any order gives the same result. Duplicate listings and several listings of one
 * physical property count once (the lowest listing id is kept).
 */
export function selectComparables(
  subject: ListingWithProperty,
  candidates: readonly ListingWithProperty[],
  minCount = MIN_COMPARABLES,
): ComparableSelection {
  if (!hasValidPriceAndArea(subject)) return { status: "invalid-subject" };

  const byProperty = new Map<string, ListingWithProperty>();
  for (const candidate of candidates) {
    if (!isEligible(subject, candidate)) continue;
    const kept = byProperty.get(candidate.listing.propertyId);
    if (!kept || candidate.listing.id < kept.listing.id) {
      byProperty.set(candidate.listing.propertyId, candidate);
    }
  }
  const city = [...byProperty.values()].sort((a, b) =>
    a.listing.id < b.listing.id ? -1 : a.listing.id > b.listing.id ? 1 : 0,
  );

  const subjectDistrict = knownDistrict(subject.property.district);
  const district =
    subjectDistrict === null
      ? []
      : city.filter((item) => knownDistrict(item.property.district) === subjectDistrict);

  const counts = { districtCount: district.length, cityCount: city.length };
  if (district.length >= minCount) {
    return { status: "enough", scope: "district", comparables: district, ...counts };
  }
  if (city.length >= minCount) {
    return { status: "enough", scope: "city", comparables: city, ...counts };
  }
  return { status: "insufficient", ...counts };
}
