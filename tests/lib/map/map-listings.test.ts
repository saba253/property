import { describe, expect, it } from "vitest";
import type { ExchangeRateState } from "@/lib/currency/exchange-rate";
import {
  type MapListing,
  clusterByPixels,
  countMappable,
  describeCluster,
  getInitialBounds,
  groupMapMarkers,
  markersSignature,
  toMapListing,
} from "@/lib/map/map-listings";
import { GEORGIA_BOUNDS } from "@/lib/geo/location";
import { getListingDisplayPrice } from "@/lib/pricing/display-price";
import { getDistrictsPresentIn } from "@/lib/properties/cities";
import { buildListingDetailHref } from "@/lib/properties/filter-chips";
import {
  getActiveDemoListingsWithProperties,
  getDemoListingCover,
} from "@/lib/properties/get-demo-listing";
import { filterListings, parseListingFilters } from "@/lib/properties/listing-filters";
import { MAP_TILES } from "@/lib/map/tiles";

// Fixture rate with easy arithmetic, not a claim about any current rate.
const rate: ExchangeRateState = {
  status: "available",
  freshness: "current",
  rate: { source: "nbg", gelPerUsd: 2.5, effectiveDate: "2026-10-10", publishedAt: null },
};
const items = getActiveDemoListingsWithProperties();
const knownDistricts = getDistrictsPresentIn(items.map((item) => item.property));

/** Runs the same pipeline as /properties: parse URL, filter, build map listings. */
function mapListingsFor(query: Record<string, string>, rateState: ExchangeRateState = rate) {
  const { filters, display } = parseListingFilters(query, { knownDistricts });
  const { matches } = filterListings(items, filters, display, rateState);
  return {
    matches,
    listings: matches.map((item) =>
      toMapListing(item, {
        price: getListingDisplayPrice(item, display, rateState),
        href: buildListingDetailHref(item.listing.id, display),
        ...getDemoListingCover(item.listing.id),
      }),
    ),
  };
}

describe("map listings use the same filtered results as the list", () => {
  it("contains exactly the filtered listings, in the same order", () => {
    const queries: Record<string, string>[] = [
      {},
      { transaction: "rent" },
      { city: "tbilisi" },
      { city: "tbilisi", district: "ვაკე" },
      { type: "house" },
      { maxPrice: "100000" },
      { amenity: "garage" },
      { rooms: "2", display: "GEL" },
    ];
    for (const query of queries) {
      const { matches, listings } = mapListingsFor(query);
      expect(listings.map((listing) => listing.id)).toEqual(matches.map((item) => item.listing.id));
    }
  });

  it("returns no listings and no markers for an empty result", () => {
    const { listings } = mapListingsFor({ city: "tbilisi", maxPrice: "1" });
    expect(listings).toEqual([]);
    expect(groupMapMarkers(listings)).toEqual([]);
    expect(getInitialBounds([])).toEqual(GEORGIA_BOUNDS);
  });
});

describe("price marker formatting", () => {
  const byId = (listings: MapListing[], id: string) =>
    listings.find((listing) => listing.id === id)!;

  it("shows the same prices as cards, in USD by default", () => {
    const { listings } = mapListingsFor({});
    expect(byId(listings, "demo-listing-1").priceText).toBe("$150,000");
    // demo-listing-4 is priced in GEL (₾165,000): converted, marked with ≈.
    expect(byId(listings, "demo-listing-4").priceText).toBe("≈ $66,000");
    expect(byId(listings, "demo-listing-4").originalPriceNote).toContain("₾165,000");
  });

  it("switches to GEL with the display currency", () => {
    const { listings } = mapListingsFor({ display: "GEL" });
    expect(byId(listings, "demo-listing-1").priceText).toBe("≈ ₾375,000");
    expect(byId(listings, "demo-listing-4").priceText).toBe("₾165,000");
  });

  it("labels monthly rent", () => {
    const { listings } = mapListingsFor({ transaction: "rent" });
    for (const listing of listings) {
      expect(listing.priceText).toMatch(/\/ თვე$/);
      expect(listing.transactionLabel).toBe("ქირავდება");
    }
  });

  it("shows original prices when no exchange rate is available", () => {
    const { listings } = mapListingsFor({}, { status: "unavailable" });
    expect(byId(listings, "demo-listing-4").priceText).toBe("₾165,000");
  });

  it("uses the marker group's price as label and keeps the detail link", () => {
    const { listings } = mapListingsFor({ city: "tbilisi", district: "ვაკე" });
    const [group] = groupMapMarkers(listings);
    expect(group.label).toBe("$150,000");
    expect(listings[0].href).toBe("/properties/demo-listing-1");
  });
});

describe("approximate locations and missing coordinates", () => {
  it("marks area-level positions as approximate in the accessible name", () => {
    const { listings } = mapListingsFor({});
    const groups = groupMapMarkers(listings);
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group.precision).toBe("approximate");
      expect(group.accessibleName).toContain("მიახლოებითი მდებარეობა");
    }
  });

  it("keeps listings without coordinates in the list but never on the map", () => {
    const { listings } = mapListingsFor({ city: "batumi" });
    const unmapped = listings.filter((listing) => listing.position === null);
    expect(unmapped.map((listing) => listing.id).sort()).toEqual([
      "demo-listing-5",
      "demo-listing-8",
    ]);
    for (const listing of unmapped) expect(listing.precision).toBe("unknown");
    const markerIds = groupMapMarkers(listings).flatMap((group) => group.listingIds);
    expect(markerIds).not.toContain("demo-listing-5");
    expect(countMappable(listings)).toEqual({ mapped: 2, unmapped: 2 });
  });

  it("shows a result with only unmapped listings without inventing markers", () => {
    const { listings } = mapListingsFor({ transaction: "rent", city: "batumi" });
    expect(listings.map((listing) => listing.id)).toEqual(["demo-listing-10"]);
    expect(groupMapMarkers(listings)).toEqual([]);
  });

  it("puts listings that share one area point on one marker, never stacked", () => {
    const base = mapListingsFor({}).listings[0];
    const second = { ...base, id: "other", title: "მეორე", priceText: "$99,000" };
    const groups = groupMapMarkers([base, second]);
    expect(groups).toHaveLength(1);
    expect(groups[0].listingIds).toEqual([base.id, "other"]);
    expect(groups[0].label).toBe("2 განცხადება");
    expect(groups[0].accessibleName).toBe("2 განცხადება, თბილისი, ვაკე. მიახლოებითი მდებარეობა.");
  });
});

describe("map viewport and clustering", () => {
  it("fits all markers", () => {
    const groups = groupMapMarkers(mapListingsFor({}).listings);
    const bounds = getInitialBounds(groups);
    for (const group of groups) {
      expect(group.point.lat).toBeGreaterThanOrEqual(bounds.south);
      expect(group.point.lat).toBeLessThanOrEqual(bounds.north);
      expect(group.point.lng).toBeGreaterThanOrEqual(bounds.west);
      expect(group.point.lng).toBeLessThanOrEqual(bounds.east);
    }
  });

  it("merges markers that would overlap on screen and keeps distant ones apart", () => {
    expect(
      clusterByPixels([
        { key: "a", x: 0, y: 0 },
        { key: "b", x: 30, y: 20 },
        { key: "c", x: 300, y: 0 },
      ]),
    ).toEqual([["a", "b"], ["c"]]);
    expect(clusterByPixels([])).toEqual([]);
  });

  it("describes a cluster by listing count and city", () => {
    const groups = groupMapMarkers(mapListingsFor({ city: "tbilisi" }).listings);
    expect(describeCluster(groups).label).toBe(`${groups.length} განცხადება · თბილისი`);
    const all = groupMapMarkers(mapListingsFor({}).listings);
    expect(describeCluster(all).label).toBe(`${all.length} განცხადება`);
  });

  it("changes the marker signature only when markers change", () => {
    const a = groupMapMarkers(mapListingsFor({}).listings);
    const b = groupMapMarkers(mapListingsFor({}).listings);
    expect(markersSignature(a)).toBe(markersSignature(b));
    const c = groupMapMarkers(mapListingsFor({ display: "GEL" }).listings);
    expect(markersSignature(c)).not.toBe(markersSignature(a));
  });
});

describe("transparency", () => {
  it("keeps the OpenStreetMap attribution with the tiles", () => {
    expect(MAP_TILES.attribution).toContain("OpenStreetMap");
    expect(MAP_TILES.url).toMatch(/^https:\/\//);
  });

  it("keeps demo titles on map listings", () => {
    for (const listing of mapListingsFor({}).listings) {
      expect(listing.title.startsWith("დემო:")).toBe(true);
    }
  });
});
