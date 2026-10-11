import { describe, expect, it } from "vitest";
import {
  getActiveDemoListingsWithProperties,
  getDemoListingIds,
  getDemoListingWithProperty,
} from "@/lib/properties/get-demo-listing";

describe("getDemoListingWithProperty", () => {
  it("returns the listing together with its property", () => {
    const result = getDemoListingWithProperty("demo-listing-1");
    expect(result).not.toBeNull();
    expect(result?.listing.id).toBe("demo-listing-1");
    expect(result?.property.id).toBe(result?.listing.propertyId);
  });

  it("returns null for an unknown id", () => {
    expect(getDemoListingWithProperty("does-not-exist")).toBeNull();
  });
});

describe("getDemoListingIds", () => {
  it("returns every demo listing id", () => {
    expect(getDemoListingIds()).toEqual([
      "demo-listing-1",
      "demo-listing-2",
      "demo-listing-3",
      "demo-listing-4",
      "demo-listing-5",
      "demo-listing-6",
    ]);
  });
});

describe("getActiveDemoListingsWithProperties", () => {
  it("returns every active demo listing in data order", () => {
    const ids = getActiveDemoListingsWithProperties().map((item) => item.listing.id);
    expect(ids).toEqual([
      "demo-listing-1",
      "demo-listing-2",
      "demo-listing-3",
      "demo-listing-4",
      "demo-listing-5",
      "demo-listing-6",
    ]);
  });

  it("pairs each listing with its own property", () => {
    for (const { listing, property } of getActiveDemoListingsWithProperties()) {
      expect(property.id).toBe(listing.propertyId);
    }
  });

  it("returns only active, demo-flagged listings", () => {
    for (const { listing } of getActiveDemoListingsWithProperties()) {
      expect(listing.status).toBe("active");
      expect(listing.dataSource).toBe("demo");
    }
  });
});
