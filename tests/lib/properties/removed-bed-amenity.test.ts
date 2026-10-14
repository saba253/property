import { describe, expect, it } from "vitest";
import { COMPARISON_ROWS } from "@/lib/compare/comparison";
import { getEditableAmenities } from "@/lib/listing-draft/draft";
import { AMENITIES, isAmenityKey } from "@/lib/properties/amenities";
import { getDistrictsPresentIn } from "@/lib/properties/cities";
import { demoListings } from "@/lib/properties/demo-data";
import { getActiveDemoListingsWithProperties } from "@/lib/properties/get-demo-listing";
import { filterListings, parseListingFilters } from "@/lib/properties/listing-filters";
import { getCardFacts } from "@/lib/properties/property-facts";

// "საწოლი" (bed) was removed from the furniture and appliances characteristics. Bedrooms and
// rooms are structural facts and must keep working.

const items = getActiveDemoListingsWithProperties();
const knownDistricts = getDistrictsPresentIn(items.map((item) => item.property));
const rate = { status: "unavailable" as const };

describe("removed bed characteristic", () => {
  it("is no longer a characteristic anywhere it was offered", () => {
    expect(isAmenityKey("bed")).toBe(false);
    expect(AMENITIES.map((amenity) => amenity.label)).not.toContain("საწოლი");
    expect(getEditableAmenities("apartment").map((amenity) => amenity.key)).not.toContain("bed");
    expect(COMPARISON_ROWS.map((row) => row.key)).not.toContain("amenity-bed");
  });

  it("is not stored in demo listings any more", () => {
    for (const listing of demoListings) {
      expect(Object.keys(listing.equipment ?? {})).not.toContain("bed");
    }
  });

  it("is ignored with a notice in old URLs, keeping every other criterion", () => {
    const parsed = parseListingFilters(
      { amenity: ["bed", "furniture"], city: "tbilisi", minBedrooms: "2" },
      { knownDistricts },
    );
    expect(parsed.filters).toEqual({
      amenities: ["furniture"],
      citySlug: "tbilisi",
      minBedrooms: 2,
    });
    expect(parsed.issues).toEqual([{ code: "invalid-amenity" }]);
  });

  it("still opens an old bookmarked search with bed as an ordinary search", () => {
    // Saved searches were removed later; their URLs are plain /properties searches.
    const query = Object.fromEntries(new URLSearchParams("city=tbilisi&amenity=balcony"));
    const parsed = parseListingFilters(
      { ...query, amenity: ["bed", "balcony"] },
      { knownDistricts },
    );
    expect(parsed.filters).toEqual({ amenities: ["balcony"], citySlug: "tbilisi" });
    expect(parsed.issues).toEqual([{ code: "invalid-amenity" }]);
  });
});

describe("bedrooms and rooms still work", () => {
  it("filters by bedrooms and rooms", () => {
    const ids = (query: Record<string, string>) => {
      const { filters, display } = parseListingFilters(query, { knownDistricts });
      return filterListings(items, filters, display, rate).matches.map((item) => item.listing.id);
    };
    expect(ids({ minBedrooms: "3" }).length).toBeGreaterThan(0);
    expect(ids({ rooms: "2" }).length).toBeGreaterThan(0);
    expect(ids({ minBedrooms: "3" })).not.toEqual(ids({}));
  });

  it("shows bedroom and room counts on cards", () => {
    const vake = items.find((item) => item.listing.id === "demo-listing-1")!;
    expect(getCardFacts(vake.property)).toEqual(
      expect.arrayContaining(["3 ოთახი", "2 საძინებელი"]),
    );
  });
});
