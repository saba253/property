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

  it("uses positive whole numbers for optional rooms and floor when present", () => {
    for (const property of demoProperties) {
      for (const value of [property.rooms, property.floor]) {
        if (value !== undefined) {
          expect(Number.isInteger(value) && value > 0).toBe(true);
        }
      }
    }
  });

  it("uses valid whole numbers for optional bedrooms, bathrooms, and total floors", () => {
    for (const property of demoProperties) {
      if (property.bedrooms !== undefined) {
        expect(Number.isInteger(property.bedrooms) && property.bedrooms >= 0).toBe(true);
      }
      for (const value of [property.bathrooms, property.totalFloors]) {
        if (value !== undefined) {
          expect(Number.isInteger(value) && value > 0).toBe(true);
        }
      }
    }
  });

  it("keeps bedrooms below total rooms and the floor within the building", () => {
    for (const property of demoProperties) {
      if (property.bedrooms !== undefined && property.rooms !== undefined) {
        expect(property.bedrooms).toBeLessThan(property.rooms);
      }
      if (property.floor !== undefined && property.totalFloors !== undefined) {
        expect(property.floor).toBeLessThanOrEqual(property.totalFloors);
      }
    }
  });

  it("uses only valid amenity states", () => {
    const valid = ["yes", "no", "unknown"];
    for (const property of demoProperties) {
      for (const status of Object.values(property.features ?? {})) {
        expect(valid).toContain(status);
      }
    }
    for (const listing of demoListings) {
      for (const status of Object.values(listing.equipment ?? {})) {
        expect(valid).toContain(status);
      }
    }
  });

  it("has six demo listings in Tbilisi and Batumi", () => {
    expect(demoListings).toHaveLength(6);
    expect([...new Set(demoProperties.map((property) => property.city))].sort()).toEqual([
      "ბათუმი",
      "თბილისი",
    ]);
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
