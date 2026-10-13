import { GEORGIA_BOUNDS, type MapPosition, resolveMapPosition } from "@/lib/geo/location";
import type { DisplayPrice } from "@/lib/pricing/display-price";
import {
  formatDisplayAmount,
  formatDisplayPricePerSqm,
  originalPriceNote,
} from "@/lib/pricing/format-display-price";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import { PROPERTY_TYPES, TRANSACTION_TYPES } from "@/lib/properties/listing-types";
import { getCardFacts } from "@/lib/properties/property-facts";
import type { GeoPoint, ListingImage, LocationPrecision } from "@/lib/properties/types";

/**
 * Everything the map view needs about one search result, as plain serializable data. It is
 * built on the server from the same filtered results, display prices and URLs as the list view,
 * so the map never filters or formats prices on its own.
 */
export type MapListing = {
  id: string;
  href: string;
  title: string;
  transactionLabel: string;
  propertyTypeLabel: string;
  /** Same text as the listing card: "≈ $63,449", "$1,200 / თვე", ... */
  priceText: string;
  pricePerSqmText: string | null;
  originalPriceNote: string;
  facts: string[];
  /** "თბილისი, ვაკე" */
  place: string;
  precision: LocationPrecision;
  position: MapPosition | null;
  coverImage: ListingImage | null;
  imageCount: number;
};

export function toMapListing(
  item: ListingWithProperty,
  details: {
    price: DisplayPrice;
    href: string;
    coverImage: ListingImage | null;
    imageCount: number;
  },
): MapListing {
  const { listing, property } = item;
  const position = resolveMapPosition(property);
  return {
    id: listing.id,
    href: details.href,
    title: listing.title,
    transactionLabel: TRANSACTION_TYPES[listing.transactionType].label,
    propertyTypeLabel: PROPERTY_TYPES[property.type].label,
    priceText: formatDisplayAmount(details.price),
    pricePerSqmText: formatDisplayPricePerSqm(details.price),
    originalPriceNote: originalPriceNote(details.price),
    facts: getCardFacts(property),
    place: `${property.city}, ${property.district}`,
    precision: position?.precision ?? "unknown",
    position,
    coverImage: details.coverImage,
    imageCount: details.imageCount,
  };
}

/** One marker on the map: a single listing, or several listings that share an area point. */
export type MarkerGroup = {
  key: string;
  point: GeoPoint;
  precision: MapPosition["precision"];
  listingIds: string[];
  /** Text on the marker: the price for one listing, the count for several. */
  label: string;
  /** Accessible name of the marker, including that the position is approximate. */
  accessibleName: string;
  place: string;
};

/** "1 განცხადება", "2 განცხადება" (Georgian nouns stay singular after numbers). */
export function formatListingCount(count: number): string {
  return `${count} განცხადება`;
}

/**
 * Groups mappable listings into markers, in result order. Listings that only have the same
 * approximate area point share one marker, so they never look like separate buildings stacked
 * on one spot. Listings without a position are left out (they stay in the list).
 */
export function groupMapMarkers(listings: readonly MapListing[]): MarkerGroup[] {
  const groups = new Map<string, MapListing[]>();
  for (const listing of listings) {
    if (!listing.position) continue;
    const key = listing.position.groupKey;
    groups.set(key, [...(groups.get(key) ?? []), listing]);
  }

  return [...groups.entries()].map(([key, members]) => {
    const { position, place } = members[0];
    const approximate = position!.precision === "approximate" ? " მიახლოებითი მდებარეობა." : "";
    const single = members.length === 1;
    return {
      key,
      point: position!.point,
      precision: position!.precision,
      listingIds: members.map((member) => member.id),
      label: single ? members[0].priceText : formatListingCount(members.length),
      accessibleName: single
        ? `${members[0].priceText}, ${members[0].title}, ${place}.${approximate}`
        : `${formatListingCount(members.length)}, ${place}.${approximate}`,
      place,
    };
  });
}

/** How many results can and cannot be shown on the map. */
export function countMappable(listings: readonly MapListing[]): {
  mapped: number;
  unmapped: number;
} {
  const mapped = listings.filter((listing) => listing.position !== null).length;
  return { mapped, unmapped: listings.length - mapped };
}

export type MapBounds = { south: number; west: number; north: number; east: number };

/**
 * The area the map should show first: all markers, or the whole of Georgia when there is nothing
 * to show. A single point gives a zero-size box; the map then centres on it at area zoom.
 */
export function getInitialBounds(groups: readonly MarkerGroup[]): MapBounds {
  if (groups.length === 0) return { ...GEORGIA_BOUNDS };
  const lats = groups.map((group) => group.point.lat);
  const lngs = groups.map((group) => group.point.lng);
  return {
    south: Math.min(...lats),
    west: Math.min(...lngs),
    north: Math.max(...lats),
    east: Math.max(...lngs),
  };
}

/** A string that changes only when the markers change, to avoid redrawing them needlessly. */
export function markersSignature(groups: readonly MarkerGroup[]): string {
  return groups
    .map((group) => `${group.key}=${group.label}|${group.listingIds.join(",")}`)
    .join(";");
}

/** Screen distance in pixels below which markers would overlap and are shown as one cluster. */
export const CLUSTER_RADIUS_PX = 64;

/**
 * Greedy screen-space clustering: each marker joins the first cluster whose first marker is
 * within `radius` pixels, otherwise it starts a new cluster. Input order is kept, so the result
 * is stable. Positions are screen pixels at the current zoom; zooming in splits clusters.
 */
export function clusterByPixels(
  points: readonly { key: string; x: number; y: number }[],
  radius: number = CLUSTER_RADIUS_PX,
): string[][] {
  const clusters: { x: number; y: number; keys: string[] }[] = [];
  for (const point of points) {
    const near = clusters.find(
      (cluster) => Math.hypot(cluster.x - point.x, cluster.y - point.y) < radius,
    );
    if (near) near.keys.push(point.key);
    else clusters.push({ x: point.x, y: point.y, keys: [point.key] });
  }
  return clusters.map((cluster) => cluster.keys);
}

/** Label and accessible name of a cluster of several marker groups. */
export function describeCluster(groups: readonly MarkerGroup[]): {
  label: string;
  accessibleName: string;
} {
  const count = groups.reduce((sum, group) => sum + group.listingIds.length, 0);
  const cities = new Set(groups.map((group) => group.place.split(",")[0]));
  const where = cities.size === 1 ? ` · ${[...cities][0]}` : "";
  return {
    label: `${formatListingCount(count)}${where}`,
    accessibleName: `${formatListingCount(count)}${where}. მასშტაბის გასადიდებლად დააჭირეთ.`,
  };
}
