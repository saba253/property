import type { GeoPoint } from "@/lib/properties/types";

/**
 * A reference point for a whole area (district or neighbourhood), used to show listings whose
 * exact location is unknown. It marks the area, not any building, and is always labelled as an
 * approximate location. There are no boundaries here: only one point per area.
 */
export type AreaReference = {
  id: string;
  /** Georgian city name, as in Property.city. */
  city: string;
  /** Georgian district name, as in Property.district. */
  district: string;
  /** Rounded to 3 decimals (about 100 m); the area itself is much larger than that. */
  point: GeoPoint;
  /** Where the point comes from, so it can be checked again. */
  source: {
    name: "OpenStreetMap";
    osmType: "relation" | "way" | "node";
    osmId: number;
    kind: string;
  };
};

/*
 * Reference data: the representative point of the matching OpenStreetMap place or
 * administrative object, looked up manually on 2026-10-13 (one search per area via the
 * OpenStreetMap Nominatim website, no automated geocoding in the app). Data © OpenStreetMap
 * contributors, available under the Open Database License (ODbL 1.0).
 *
 * Only areas with an unambiguous OpenStreetMap place object are listed. Not listed, because no
 * trustworthy object was found: "ახალი ბულვარი" (Batumi) and "აეროპორტის დასახლება" (Batumi; the
 * OpenStreetMap object of that name is in Tbilisi). Listings in those areas get no map pin.
 */
export const AREA_REFERENCES: readonly AreaReference[] = [
  {
    id: "tbilisi-vake",
    city: "თბილისი",
    district: "ვაკე",
    point: { lat: 41.709, lng: 44.764 },
    source: { name: "OpenStreetMap", osmType: "relation", osmId: 16355086, kind: "neighbourhood" },
  },
  {
    id: "tbilisi-saburtalo",
    city: "თბილისი",
    district: "საბურთალო",
    point: { lat: 41.725, lng: 44.752 },
    source: { name: "OpenStreetMap", osmType: "relation", osmId: 5469869, kind: "neighbourhood" },
  },
  {
    id: "tbilisi-isani",
    city: "თბილისი",
    district: "ისანი",
    point: { lat: 41.688, lng: 44.834 },
    source: { name: "OpenStreetMap", osmType: "relation", osmId: 18467266, kind: "neighbourhood" },
  },
  {
    id: "tbilisi-dighomi",
    city: "თბილისი",
    district: "დიღომი",
    point: { lat: 41.784, lng: 44.731 },
    source: { name: "OpenStreetMap", osmType: "relation", osmId: 16356611, kind: "quarter" },
  },
  {
    id: "tbilisi-tskneti",
    city: "თბილისი",
    district: "წყნეთი",
    point: { lat: 41.694, lng: 44.694 },
    source: { name: "OpenStreetMap", osmType: "relation", osmId: 11879843, kind: "neighbourhood" },
  },
  {
    id: "batumi-old-batumi",
    city: "ბათუმი",
    district: "ძველი ბათუმი",
    point: { lat: 41.651, lng: 41.638 },
    source: { name: "OpenStreetMap", osmType: "relation", osmId: 12695439, kind: "administrative" },
  },
  {
    id: "batumi-boni-gorodok",
    city: "ბათუმი",
    district: "ბონი-გოროდოკი",
    point: { lat: 41.641, lng: 41.665 },
    source: { name: "OpenStreetMap", osmType: "relation", osmId: 15061766, kind: "administrative" },
  },
];
