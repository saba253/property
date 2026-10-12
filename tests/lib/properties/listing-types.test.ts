import { describe, expect, it } from "vitest";
import { demoListings } from "@/lib/properties/demo-data";
import {
  DEFAULT_TRANSACTION_TYPE,
  PROPERTY_TYPES,
  PROPERTY_TYPE_ORDER,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_ORDER,
  assertNever,
  getPricePeriod,
  isPropertyType,
  isTransactionType,
} from "@/lib/properties/listing-types";
import type { Listing } from "@/lib/properties/types";

describe("property type registry", () => {
  it("defines apartment and private house with Georgian labels", () => {
    expect(PROPERTY_TYPES.apartment.label).toBe("ბინა");
    expect(PROPERTY_TYPES.house.label).toBe("კერძო სახლი");
  });

  it("lists every registered type exactly once in the display order", () => {
    expect([...PROPERTY_TYPE_ORDER].sort()).toEqual(Object.keys(PROPERTY_TYPES).sort());
  });

  it("marks floor as apartment-only and storeys and land area as house-only", () => {
    expect(PROPERTY_TYPES.apartment).toMatchObject({
      hasFloor: true,
      hasStoreys: false,
      hasLandArea: false,
    });
    expect(PROPERTY_TYPES.house).toMatchObject({
      hasFloor: false,
      hasStoreys: true,
      hasLandArea: true,
    });
  });

  it("recognizes only registered property types", () => {
    expect(isPropertyType("apartment")).toBe(true);
    expect(isPropertyType("house")).toBe(true);
    for (const value of ["land", "commercial", "Apartment", "", "toString", "__proto__"]) {
      expect(isPropertyType(value)).toBe(false);
    }
  });
});

describe("transaction type registry", () => {
  it("defines sale and rent with Georgian labels, sale first", () => {
    expect(TRANSACTION_TYPES.sale.label).toBe("იყიდება");
    expect(TRANSACTION_TYPES.rent.label).toBe("ქირავდება");
    expect(TRANSACTION_TYPE_ORDER).toEqual(["sale", "rent"]);
  });

  it("defaults to sale", () => {
    expect(DEFAULT_TRANSACTION_TYPE).toBe("sale");
  });

  it("recognizes only sale and rent (there is no 'all')", () => {
    expect(isTransactionType("sale")).toBe(true);
    expect(isTransactionType("rent")).toBe(true);
    for (const value of ["all", "lease", "SALE", "", "constructor"]) {
      expect(isTransactionType(value)).toBe(false);
    }
  });
});

describe("getPricePeriod", () => {
  const base = {
    id: "l",
    propertyId: "p",
    title: "დემო: x",
    askingPrice: { amount: 1000, currency: "USD" as const },
    status: "active" as const,
    dataSource: "demo" as const,
  };

  it("returns null for a sale and the period for rent", () => {
    expect(getPricePeriod({ ...base, transactionType: "sale" })).toBeNull();
    expect(getPricePeriod({ ...base, transactionType: "rent", rentPeriod: "month" })).toBe("month");
  });

  it("gives every demo rental a monthly price", () => {
    const periods = demoListings.map((listing: Listing) => getPricePeriod(listing));
    expect(periods.filter((period) => period !== null).every((period) => period === "month")).toBe(
      true,
    );
  });
});

describe("assertNever", () => {
  it("throws if reached at runtime", () => {
    expect(() => assertNever("land" as never)).toThrow("Unexpected value: land");
  });
});
