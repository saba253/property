import { describe, expect, it } from "vitest";
import {
  filterListings,
  hasActiveFilters,
  parseListingFilters,
  parseNonNegativeNumber,
} from "@/lib/properties/listing-filters";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import { getActiveDemoListingsWithProperties } from "@/lib/properties/get-demo-listing";

const demoItems = getActiveDemoListingsWithProperties();

function ids(items: ListingWithProperty[]): string[] {
  return items.map((item) => item.listing.id);
}

describe("parseNonNegativeNumber", () => {
  it("accepts integers, decimals, and thousands separators", () => {
    expect(parseNonNegativeNumber("150000")).toBe(150000);
    expect(parseNonNegativeNumber("48.5")).toBe(48.5);
    expect(parseNonNegativeNumber("150,000")).toBe(150000);
    expect(parseNonNegativeNumber("150 000")).toBe(150000);
  });

  it("rejects negative, non-numeric, and special values", () => {
    for (const value of ["-5", "abc", "1e5", "Infinity", "NaN", "12abc", "1.2.3", "0x10"]) {
      expect(parseNonNegativeNumber(value)).toBeNull();
    }
  });
});

describe("parseListingFilters", () => {
  it("returns no filters and no issues for an empty query", () => {
    expect(parseListingFilters({})).toEqual({ filters: {}, issues: [] });
  });

  it("treats empty values as not set", () => {
    const result = parseListingFilters({ city: "", currency: " ", minPrice: "", maxArea: "" });
    expect(result).toEqual({ filters: {}, issues: [] });
  });

  it("parses a complete valid query", () => {
    const result = parseListingFilters({
      city: "tbilisi",
      currency: "USD",
      minPrice: "100000",
      maxPrice: "200000",
      minArea: "40",
      maxArea: "80",
    });
    expect(result.issues).toEqual([]);
    expect(result.filters).toEqual({
      citySlug: "tbilisi",
      currency: "USD",
      minPrice: 100000,
      maxPrice: 200000,
      minArea: 40,
      maxArea: 80,
    });
  });

  it("normalizes letter case of city and currency", () => {
    const { filters } = parseListingFilters({ city: "Batumi", currency: "gel" });
    expect(filters).toEqual({ citySlug: "batumi", currency: "GEL" });
  });

  it("uses the first value of a repeated parameter", () => {
    const { filters } = parseListingFilters({ city: ["batumi", "tbilisi"] });
    expect(filters.citySlug).toBe("batumi");
  });

  it("drops and reports an unknown city or currency", () => {
    const result = parseListingFilters({ city: "paris", currency: "EUR" });
    expect(result.filters).toEqual({});
    expect(result.issues).toEqual([{ code: "invalid-city" }, { code: "invalid-currency" }]);
  });

  it("drops and reports invalid numbers", () => {
    const result = parseListingFilters({ minArea: "-10", maxArea: "abc" });
    expect(result.filters).toEqual({});
    expect(result.issues).toEqual([
      { code: "invalid-number", field: "minArea" },
      { code: "invalid-number", field: "maxArea" },
    ]);
  });

  it("swaps an inverted area range", () => {
    const result = parseListingFilters({ minArea: "80", maxArea: "40" });
    expect(result.filters).toEqual({ minArea: 40, maxArea: 80 });
    expect(result.issues).toEqual([{ code: "swapped-area-range" }]);
  });

  it("swaps an inverted price range", () => {
    const result = parseListingFilters({ currency: "USD", minPrice: "200000", maxPrice: "1" });
    expect(result.filters).toMatchObject({ minPrice: 1, maxPrice: 200000 });
    expect(result.issues).toEqual([{ code: "swapped-price-range" }]);
  });

  it("ignores price limits without a currency so currencies are never mixed", () => {
    const result = parseListingFilters({ minPrice: "100000", maxPrice: "300000" });
    expect(result.filters).toEqual({});
    expect(result.issues).toEqual([{ code: "price-needs-currency" }]);
  });

  it("ignores price limits when the currency is invalid", () => {
    const result = parseListingFilters({ currency: "EUR", minPrice: "1" });
    expect(result.filters).toEqual({});
    expect(result.issues).toEqual([{ code: "invalid-currency" }, { code: "price-needs-currency" }]);
  });
});

describe("hasActiveFilters", () => {
  it("is false for no filters and true for any filter", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ minArea: 0 })).toBe(true);
  });
});

describe("filterListings", () => {
  it("returns every active listing when no filters are set", () => {
    expect(ids(filterListings(demoItems, {}))).toEqual(["demo-listing-1", "demo-listing-2"]);
  });

  it("filters by city", () => {
    expect(ids(filterListings(demoItems, { citySlug: "tbilisi" }))).toEqual(["demo-listing-1"]);
    expect(ids(filterListings(demoItems, { citySlug: "batumi" }))).toEqual(["demo-listing-2"]);
  });

  it("filters by currency", () => {
    expect(ids(filterListings(demoItems, { currency: "USD" }))).toEqual(["demo-listing-1"]);
    expect(ids(filterListings(demoItems, { currency: "GEL" }))).toEqual(["demo-listing-2"]);
  });

  it("compares prices only within the chosen currency", () => {
    // 200,000 is above the USD listing (150,000) but below the GEL listing (220,000).
    expect(ids(filterListings(demoItems, { currency: "GEL", minPrice: 200000 }))).toEqual([
      "demo-listing-2",
    ]);
    expect(ids(filterListings(demoItems, { currency: "USD", minPrice: 200000 }))).toEqual([]);
  });

  it("includes listings exactly on the price and area limits", () => {
    const filters = { currency: "USD" as const, minPrice: 150000, maxPrice: 150000 };
    expect(ids(filterListings(demoItems, filters))).toEqual(["demo-listing-1"]);
    expect(ids(filterListings(demoItems, { minArea: 48.5, maxArea: 48.5 }))).toEqual([
      "demo-listing-2",
    ]);
  });

  it("filters by area", () => {
    expect(ids(filterListings(demoItems, { minArea: 60 }))).toEqual(["demo-listing-1"]);
    expect(ids(filterListings(demoItems, { maxArea: 50 }))).toEqual(["demo-listing-2"]);
  });

  it("combines filters", () => {
    expect(ids(filterListings(demoItems, { citySlug: "batumi", currency: "USD" }))).toEqual([]);
  });

  it("never returns inactive listings", () => {
    const inactive: ListingWithProperty = {
      listing: { ...demoItems[0].listing, id: "demo-inactive", status: "inactive" },
      property: demoItems[0].property,
    };
    expect(ids(filterListings([...demoItems, inactive], {}))).not.toContain("demo-inactive");
  });
});
