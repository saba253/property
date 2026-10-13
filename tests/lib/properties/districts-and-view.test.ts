import { describe, expect, it } from "vitest";
import type { DistrictOption } from "@/lib/properties/cities";
import { getDistrictsPresentIn } from "@/lib/properties/cities";
import { buildListingsHref, getFilterChips } from "@/lib/properties/filter-chips";
import { getActiveDemoListingsWithProperties } from "@/lib/properties/get-demo-listing";
import { filterListings, parseListingFilters } from "@/lib/properties/listing-filters";
import { parseListingsView } from "@/lib/properties/listings-view";
import { getCitiesPresentIn } from "@/lib/properties/cities";
import { type SearchContext, parseSearchQuery } from "@/lib/search/parse-search-query";

const items = getActiveDemoListingsWithProperties();
const knownDistricts = getDistrictsPresentIn(items.map((item) => item.property));
const rate = {
  status: "available" as const,
  freshness: "current" as const,
  rate: { source: "nbg" as const, gelPerUsd: 2.6, effectiveDate: "2026-10-10", publishedAt: null },
};
const ids = (query: Record<string, string>) => {
  const { filters, display } = parseListingFilters(query, { knownDistricts });
  return filterListings(items, filters, display, rate).matches.map((item) => item.listing.id);
};

// A district name that exists in two cities (not in the demo data, but possible in real data).
const sharedName: DistrictOption[] = [
  { name: "ცენტრი", city: "თბილისი" },
  { name: "ცენტრი", city: "ბათუმი" },
];

describe("district filtering", () => {
  it("filters by a district from the data", () => {
    expect(ids({ district: "საბურთალო" })).toEqual(["demo-listing-3"]);
    expect(ids({ district: "ვაკე", transaction: "rent" })).toEqual(["demo-listing-9"]);
  });

  it("combines city and district", () => {
    expect(ids({ city: "tbilisi", district: "ვაკე" })).toEqual(["demo-listing-1"]);
    const parsed = parseListingFilters({ city: "batumi", district: "ვაკე" }, { knownDistricts });
    expect(parsed.filters).toEqual({ citySlug: "batumi" });
    expect(parsed.issues).toEqual([{ code: "district-not-in-city" }]);
  });

  it("does not guess a district name used in several cities", () => {
    const ambiguous = parseListingFilters({ district: "ცენტრი" }, { knownDistricts: sharedName });
    expect(ambiguous.filters).toEqual({});
    expect(ambiguous.issues).toEqual([{ code: "ambiguous-district" }]);
    const withCity = parseListingFilters(
      { district: "ცენტრი", city: "batumi" },
      { knownDistricts: sharedName },
    );
    expect(withCity.filters).toEqual({ citySlug: "batumi", district: "ცენტრი" });
    expect(withCity.issues).toEqual([]);
  });

  it("still accepts plain district names (legacy option format)", () => {
    expect(parseListingFilters({ district: "ვაკე" }, { knownDistricts: ["ვაკე"] }).filters).toEqual(
      { district: "ვაკე" },
    );
  });

  it("returns an empty result for districts without listings of the chosen type", () => {
    expect(ids({ district: "წყნეთი" })).toEqual([]);
  });
});

describe("list / map view in the URL", () => {
  it("defaults to the list for legacy and invalid URLs", () => {
    expect(parseListingsView({})).toEqual({ view: "list", invalid: false });
    expect(parseListingsView({ view: "" })).toEqual({ view: "list", invalid: false });
    expect(parseListingsView({ view: "satellite" })).toEqual({ view: "list", invalid: true });
    expect(parseListingsView({ view: ["MAP", "list"] })).toEqual({ view: "map", invalid: false });
  });

  it("keeps legacy URLs unchanged and adds view=map only for the map", () => {
    expect(buildListingsHref({ citySlug: "tbilisi" })).toBe("/properties?city=tbilisi");
    expect(buildListingsHref({ citySlug: "tbilisi" }, "USD", "list")).toBe(
      "/properties?city=tbilisi",
    );
    expect(buildListingsHref({ citySlug: "tbilisi" }, "GEL", "map")).toBe(
      "/properties?display=GEL&view=map&city=tbilisi",
    );
  });

  it("preserves every filter when switching between list and map", () => {
    const query = {
      transaction: "rent",
      type: "apartment",
      city: "tbilisi",
      district: "ვაკე",
      maxPrice: "1500",
      rooms: "3",
      amenity: ["furniture", "balcony"],
      display: "GEL",
    };
    const { filters, display } = parseListingFilters(query, { knownDistricts });
    const mapUrl = new URL(buildListingsHref(filters, display, "map"), "http://x");
    const backQuery: Record<string, string[]> = {};
    for (const key of new Set(mapUrl.searchParams.keys())) {
      backQuery[key] = mapUrl.searchParams.getAll(key);
    }
    const back = parseListingFilters(backQuery, { knownDistricts });
    expect(mapUrl.searchParams.get("view")).toBe("map");
    expect(mapUrl.searchParams.getAll("amenity")).toEqual(["balcony", "furniture"]);
    const listUrl = buildListingsHref(filters, display, "list");
    expect(listUrl).not.toContain("view=");
    expect(back.filters).toEqual(filters);
    expect(back.display).toBe("GEL");
  });

  it("keeps the map view on chip removal links, and removing the city removes its district", () => {
    const chips = getFilterChips({ citySlug: "tbilisi", district: "ვაკე", rooms: 2 }, "USD", "map");
    for (const chip of chips) expect(chip.removeHref).toContain("view=map");
    const city = chips.find((chip) => chip.key === "city")!;
    expect(city.removeHref).toBe("/properties?view=map&rooms=2");
  });
});

describe("Georgian location phrases", () => {
  const context: SearchContext = {
    cities: getCitiesPresentIn(items.map((item) => item.property.city)),
    districts: knownDistricts,
    defaultCurrency: "USD",
  };

  it("understands genitive and filler location phrases", () => {
    expect(parseSearchQuery("ვაკის რაიონში", context).params).toEqual({
      district: "ვაკე",
      city: "tbilisi",
    });
    const near = parseSearchQuery("ბინა საბურთალოს მახლობლად", context);
    expect(near.params).toEqual({ district: "საბურთალო", city: "tbilisi", type: "apartment" });
    expect(near.unrecognized).toEqual([]);
  });

  it("reports an ambiguous district instead of choosing a city", () => {
    const shared: SearchContext = { ...context, districts: [...knownDistricts, ...sharedName] };
    const result = parseSearchQuery("ცენტრი", shared);
    expect(result.params).toEqual({});
    expect(result.notes).toContainEqual({ code: "ambiguous-district", name: "ცენტრი" });
    expect(parseSearchQuery("ბათუმი ცენტრი", shared).params).toEqual({
      district: "ცენტრი",
      city: "batumi",
    });
  });
});
