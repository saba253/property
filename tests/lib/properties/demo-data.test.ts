import { describe, expect, it } from "vitest";
import { calculateAskingPricePerSqm } from "@/lib/pricing/price-per-sqm";
import { demoListings, demoProperties } from "@/lib/properties/demo-data";

describe("demo data", () => {
  it("has unique property ids", () => {
    const ids = demoProperties.map((property) => property.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique listing ids", () => {
    const ids = demoListings.map((listing) => listing.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("links every listing to an existing property", () => {
    const propertyIds = new Set(demoProperties.map((property) => property.id));
    for (const listing of demoListings) {
      expect(propertyIds.has(listing.propertyId)).toBe(true);
    }
  });

  it("flags every property and listing as demo data", () => {
    for (const property of demoProperties) {
      expect(property.dataSource).toBe("demo");
    }
    for (const listing of demoListings) {
      expect(listing.dataSource).toBe("demo");
    }
  });

  it("labels every listing title as demo", () => {
    for (const listing of demoListings) {
      expect(listing.title.startsWith("დემო")).toBe(true);
    }
  });

  it("covers both USD and GEL", () => {
    const currencies = [...new Set(demoListings.map((listing) => listing.askingPrice.currency))];
    expect(currencies.sort()).toEqual(["GEL", "USD"]);
  });

  it("produces a valid price per square metre for every listing", () => {
    for (const listing of demoListings) {
      const property = demoProperties.find((item) => item.id === listing.propertyId);
      expect(property).toBeDefined();
      expect(() =>
        calculateAskingPricePerSqm(listing.askingPrice.amount, property!.areaSqm),
      ).not.toThrow();
    }
  });
});
