import { describe, expect, it } from "vitest";
import { getDemoListingIds, getDemoListingWithProperty } from "@/lib/properties/get-demo-listing";

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
    expect(getDemoListingIds()).toEqual(["demo-listing-1", "demo-listing-2"]);
  });
});
