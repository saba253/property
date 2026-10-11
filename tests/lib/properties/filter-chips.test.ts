import { describe, expect, it } from "vitest";
import {
  buildListingDetailHref,
  buildListingsHref,
  getFilterChips,
} from "@/lib/properties/filter-chips";
import { type ListingFilters, parseListingFilters } from "@/lib/properties/listing-filters";

describe("buildListingsHref", () => {
  it("returns the plain path when no filters are set and the display is USD", () => {
    expect(buildListingsHref({})).toBe("/properties");
    expect(buildListingsHref({}, "USD")).toBe("/properties");
  });

  it("includes the display currency only when it is not the default", () => {
    expect(buildListingsHref({}, "GEL")).toBe("/properties?display=GEL");
  });

  it("builds a query in a fixed order and leaves out unset filters", () => {
    expect(buildListingsHref({ maxArea: 80, citySlug: "batumi", originalCurrency: "GEL" })).toBe(
      "/properties?city=batumi&currency=GEL&maxArea=80",
    );
  });

  it("round-trips through parseListingFilters", () => {
    const filters: ListingFilters = {
      citySlug: "tbilisi",
      originalCurrency: "USD",
      minPrice: 100000,
      maxPrice: 200000,
      minArea: 40.5,
      maxArea: 80,
    };
    for (const display of ["USD", "GEL"] as const) {
      const url = new URL(buildListingsHref(filters, display), "http://x");
      const query = Object.fromEntries(url.searchParams);
      expect(parseListingFilters(query)).toEqual({ filters, display, issues: [] });
    }
  });
});

describe("getFilterChips", () => {
  it("returns no chips when no filters are set", () => {
    expect(getFilterChips({})).toEqual([]);
  });

  it("labels every applied filter in Georgian, with the budget in the display currency", () => {
    const filters: ListingFilters = {
      citySlug: "tbilisi",
      originalCurrency: "GEL",
      minPrice: 100000,
      maxPrice: 200000,
      minArea: 40,
      maxArea: 80,
    };
    expect(getFilterChips(filters).map((chip) => chip.label)).toEqual([
      "ქალაქი: თბილისი",
      "ორიგინალი ვალუტა: GEL",
      "ბიუჯეტი: $100,000 – $200,000",
      "ფართი: 40 მ² – 80 მ²",
    ]);
    expect(getFilterChips(filters, "GEL")[2].label).toBe("ბიუჯეტი: ₾100,000 – ₾200,000");
  });

  it("describes open-ended ranges", () => {
    const labels = getFilterChips({ minPrice: 5000, maxArea: 60 }, "GEL").map((chip) => chip.label);
    expect(labels).toEqual(["ბიუჯეტი: ₾5,000-დან", "ფართი: 60 მ²-მდე"]);
  });

  it("removes only the chip's own filter", () => {
    const chips = getFilterChips({ citySlug: "batumi", minArea: 40 });
    expect(chips.find((chip) => chip.key === "city")?.removeHref).toBe("/properties?minArea=40");
    expect(chips.find((chip) => chip.key === "area")?.removeHref).toBe("/properties?city=batumi");
  });

  it("keeps the budget when the original-currency chip is removed", () => {
    const chips = getFilterChips({ originalCurrency: "USD", maxPrice: 1 });
    expect(chips.find((chip) => chip.key === "originalCurrency")?.removeHref).toBe(
      "/properties?maxPrice=1",
    );
  });

  it("keeps the display currency in remove links", () => {
    const [chip] = getFilterChips({ maxPrice: 1 }, "GEL");
    expect(chip.removeHref).toBe("/properties?display=GEL");
  });
});

describe("buildListingDetailHref", () => {
  it("links to the detail page and keeps a non-default display currency", () => {
    expect(buildListingDetailHref("demo-listing-1")).toBe("/properties/demo-listing-1");
    expect(buildListingDetailHref("demo-listing-1", "USD")).toBe("/properties/demo-listing-1");
    expect(buildListingDetailHref("demo-listing-1", "GEL")).toBe(
      "/properties/demo-listing-1?display=GEL",
    );
  });
});

describe("structure and amenity filters in URLs and chips", () => {
  const filters: ListingFilters = {
    minBedrooms: 2,
    minBathrooms: 1,
    minFloor: 3,
    maxFloor: 12,
    amenities: ["balcony", "dishwasher"],
  };

  it("adds them to the URL, with one amenity parameter per amenity", () => {
    expect(buildListingsHref(filters)).toBe(
      "/properties?minBedrooms=2&minBathrooms=1&minFloor=3&maxFloor=12&amenity=balcony&amenity=dishwasher",
    );
  });

  it("round-trips through parseListingFilters", () => {
    const url = new URL(buildListingsHref(filters, "GEL"), "http://x");
    const query: Record<string, string | string[]> = {};
    for (const key of new Set(url.searchParams.keys())) {
      const values = url.searchParams.getAll(key);
      query[key] = values.length > 1 ? values : values[0];
    }
    expect(parseListingFilters(query)).toEqual({ filters, display: "GEL", issues: [] });
  });

  it("labels them in Georgian", () => {
    expect(getFilterChips(filters).map((chip) => chip.label)).toEqual([
      "საძინებელი: 2+",
      "სველი წერტილი: 1+",
      "სართული: 3 – 12",
      "აივანი",
      "ჭურჭლის სარეცხი მანქანა",
    ]);
  });

  it("removes one amenity at a time", () => {
    const chip = getFilterChips({ amenities: ["balcony", "dishwasher"] }).find(
      (item) => item.key === "amenity-balcony",
    );
    expect(chip?.removeHref).toBe("/properties?amenity=dishwasher");
    const last = getFilterChips({ amenities: ["balcony"] })[0];
    expect(last.removeHref).toBe("/properties");
  });
});
