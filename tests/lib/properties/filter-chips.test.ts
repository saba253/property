import { describe, expect, it } from "vitest";
import { buildListingsHref, getFilterChips } from "@/lib/properties/filter-chips";
import { parseListingFilters } from "@/lib/properties/listing-filters";

describe("buildListingsHref", () => {
  it("returns the plain path when no filters are set", () => {
    expect(buildListingsHref({})).toBe("/properties");
  });

  it("builds a query in a fixed order and leaves out unset filters", () => {
    expect(buildListingsHref({ maxArea: 80, citySlug: "batumi", currency: "GEL" })).toBe(
      "/properties?city=batumi&currency=GEL&maxArea=80",
    );
  });

  it("round-trips through parseListingFilters", () => {
    const filters = {
      citySlug: "tbilisi",
      currency: "USD" as const,
      minPrice: 100000,
      maxPrice: 200000,
      minArea: 40.5,
      maxArea: 80,
    };
    const query = Object.fromEntries(new URL(buildListingsHref(filters), "http://x").searchParams);
    expect(parseListingFilters(query)).toEqual({ filters, issues: [] });
  });
});

describe("getFilterChips", () => {
  it("returns no chips when no filters are set", () => {
    expect(getFilterChips({})).toEqual([]);
  });

  it("labels every applied filter in Georgian", () => {
    const chips = getFilterChips({
      citySlug: "tbilisi",
      currency: "USD",
      minPrice: 100000,
      maxPrice: 200000,
      minArea: 40,
      maxArea: 80,
    });
    expect(chips.map((chip) => chip.label)).toEqual([
      "ქალაქი: თბილისი",
      "ვალუტა: USD",
      "ფასი: $100,000 – $200,000",
      "ფართი: 40 მ² – 80 მ²",
    ]);
  });

  it("describes open-ended ranges", () => {
    const labels = getFilterChips({ currency: "GEL", minPrice: 5000, maxArea: 60 }).map(
      (chip) => chip.label,
    );
    expect(labels).toEqual(["ვალუტა: GEL", "ფასი: ₾5,000-დან", "ფართი: 60 მ²-მდე"]);
  });

  it("removes only the chip's own filter", () => {
    const chips = getFilterChips({ citySlug: "batumi", minArea: 40 });
    expect(chips.find((chip) => chip.key === "city")?.removeHref).toBe("/properties?minArea=40");
    expect(chips.find((chip) => chip.key === "area")?.removeHref).toBe("/properties?city=batumi");
  });

  it("removes the price range together with the currency", () => {
    const chips = getFilterChips({ currency: "USD", minPrice: 1, minArea: 40 });
    expect(chips.find((chip) => chip.key === "currency")?.removeHref).toBe(
      "/properties?minArea=40",
    );
    expect(chips.find((chip) => chip.key === "price")?.removeHref).toBe(
      "/properties?currency=USD&minArea=40",
    );
  });
});
