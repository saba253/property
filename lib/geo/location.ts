import { AREA_REFERENCES, type AreaReference } from "@/lib/geo/area-reference";
import { assertNever } from "@/lib/properties/listing-types";
import type {
  GeoPoint,
  LocationPrecision,
  Property,
  PropertyLocation,
} from "@/lib/properties/types";

/** A generous box around Georgia, to catch swapped or mistyped coordinates. */
export const GEORGIA_BOUNDS = { south: 41.0, west: 39.9, north: 43.7, east: 46.8 } as const;

export function isValidGeoPoint(point: GeoPoint): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
  );
}

export function isInGeorgia(point: GeoPoint): boolean {
  return (
    isValidGeoPoint(point) &&
    point.lat >= GEORGIA_BOUNDS.south &&
    point.lat <= GEORGIA_BOUNDS.north &&
    point.lng >= GEORGIA_BOUNDS.west &&
    point.lng <= GEORGIA_BOUNDS.east
  );
}

export function findAreaReference(
  id: string,
  areas: readonly AreaReference[] = AREA_REFERENCES,
): AreaReference | null {
  return areas.find((area) => area.id === id) ?? null;
}

/** The reference point for a district of a city, if trustworthy reference data exists. */
export function findAreaForDistrict(
  city: string,
  district: string,
  areas: readonly AreaReference[] = AREA_REFERENCES,
): AreaReference | null {
  const name = district.trim();
  return areas.find((area) => area.city === city && area.district === name) ?? null;
}

/** A property's location; a missing location means unknown. */
export function getPropertyLocation(property: Property): PropertyLocation {
  return property.location ?? { precision: "unknown" };
}

export type LocationIssue =
  | "invalid-coordinates"
  | "outside-georgia"
  | "missing-verification-date"
  | "unknown-area"
  | "area-mismatch";

/**
 * Checks that a location is consistent with the property: exact points must be valid, inside
 * Georgia and carry a verification date; approximate locations must refer to a known area of the
 * property's own city and district.
 */
export function validatePropertyLocation(
  property: Property,
  areas: readonly AreaReference[] = AREA_REFERENCES,
): LocationIssue[] {
  const location = getPropertyLocation(property);
  switch (location.precision) {
    case "unknown":
      return [];
    case "exact": {
      const issues: LocationIssue[] = [];
      if (!isValidGeoPoint(location.point)) issues.push("invalid-coordinates");
      else if (!isInGeorgia(location.point)) issues.push("outside-georgia");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(location.verifiedOn)) {
        issues.push("missing-verification-date");
      }
      return issues;
    }
    case "approximate": {
      const area = findAreaReference(location.areaId, areas);
      if (!area) return ["unknown-area"];
      return area.city === property.city && area.district === property.district
        ? []
        : ["area-mismatch"];
    }
    default:
      return assertNever(location);
  }
}

/** Where to draw a property on the map, and how precise that position is. */
export type MapPosition = {
  precision: Exclude<LocationPrecision, "unknown">;
  point: GeoPoint;
  /**
   * Listings with the same key share one marker. Approximate positions group by area, so
   * several listings never look like separate buildings at the same spot.
   */
  groupKey: string;
};

/**
 * The map position of a property, or null when it has no trustworthy location (or its location
 * data is inconsistent). Nothing is guessed: no pin is placed without valid data.
 */
export function resolveMapPosition(
  property: Property,
  areas: readonly AreaReference[] = AREA_REFERENCES,
): MapPosition | null {
  if (validatePropertyLocation(property, areas).length > 0) return null;
  const location = getPropertyLocation(property);
  switch (location.precision) {
    case "unknown":
      return null;
    case "exact":
      return {
        precision: "exact",
        point: location.point,
        groupKey: `exact:${location.point.lat},${location.point.lng}`,
      };
    case "approximate": {
      const area = findAreaReference(location.areaId, areas)!;
      return { precision: "approximate", point: area.point, groupKey: `area:${area.id}` };
    }
    default:
      return assertNever(location);
  }
}

export const PRECISION_LABELS: Record<LocationPrecision, string> = {
  exact: "ზუსტი მდებარეობა",
  approximate: "მიახლოებითი მდებარეობა",
  unknown: "მდებარეობა რუქაზე არ არის მითითებული",
};

/** Longer Georgian explanation of a location's precision, for previews and detail pages. */
export function describeLocationPrecision(precision: LocationPrecision): string {
  switch (precision) {
    case "exact":
      return "ზუსტი მდებარეობა: გადამოწმებული კოორდინატები.";
    case "approximate":
      return "მიახლოებითი მდებარეობა: რუქაზე ნაჩვენებია უბნის ცენტრი და არა კონკრეტული შენობა.";
    case "unknown":
      return "მდებარეობა რუქაზე არ არის მითითებული. განცხადება ხელმისაწვდომია სიაში.";
    default:
      return assertNever(precision);
  }
}

/**
 * Location for a listing someone enters by city and district only (the draft form): approximate
 * when the district has trustworthy reference data, unknown otherwise. Exact coordinates are
 * never derived from text.
 */
export function locationFromDistrict(
  city: string,
  district: string,
  areas: readonly AreaReference[] = AREA_REFERENCES,
): PropertyLocation {
  const area = findAreaForDistrict(city, district, areas);
  return area ? { precision: "approximate", areaId: area.id } : { precision: "unknown" };
}
