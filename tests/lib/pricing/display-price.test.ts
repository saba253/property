import { describe, expect, it } from "vitest";
import type { ExchangeRateState } from "@/lib/currency/exchange-rate";
import { getDisplayPrice, getListingDisplayPrice } from "@/lib/pricing/display-price";

// Fixture rate with easy arithmetic, not a claim about any current rate.
const available: ExchangeRateState = {
  status: "available",
  freshness: "current",
  rate: { source: "nbg", gelPerUsd: 2.6, effectiveDate: "2026-10-10", publishedAt: null },
};
const unavailable: ExchangeRateState = { status: "unavailable" };

describe("getDisplayPrice", () => {
  it("shows a USD listing in USD without conversion", () => {
    const price = getDisplayPrice({ amount: 150000, currency: "USD" }, 65, "USD", available);
    expect(price).toEqual({
      original: { amount: 150000, currency: "USD" },
      currency: "USD",
      amount: 150000,
      pricePerSqm: 2307.69,
      isConverted: false,
      period: null,
    });
  });

  it("converts a GEL listing to USD (the default display) and keeps the original", () => {
    const price = getDisplayPrice({ amount: 220000, currency: "GEL" }, 48.5, "USD", available);
    // 220,000 / 2.6 = 84,615.38 -> 84,615; 84,615 / 48.5 = 1,744.64
    expect(price.amount).toBe(84615);
    expect(price.pricePerSqm).toBe(1744.64);
    expect(price.isConverted).toBe(true);
    expect(price.original).toEqual({ amount: 220000, currency: "GEL" });
  });

  it("converts a USD listing to GEL", () => {
    const price = getDisplayPrice({ amount: 150000, currency: "USD" }, 65, "GEL", available);
    expect(price.amount).toBe(390000);
    expect(price.pricePerSqm).toBe(6000);
  });

  it("calculates price per m² from the displayed (rounded) amount", () => {
    const price = getDisplayPrice({ amount: 1001, currency: "GEL" }, 3, "USD", available);
    // 1001 / 2.6 = 385.0 -> 385; 385 / 3 = 128.33
    expect(price.amount).toBe(385);
    expect(price.pricePerSqm).toBe(128.33);
  });

  it("does not mutate the original money object", () => {
    const original = { amount: 220000, currency: "GEL" as const };
    getDisplayPrice(original, 48.5, "USD", available);
    expect(original).toEqual({ amount: 220000, currency: "GEL" });
  });

  it("returns no converted amount when the rate is unavailable", () => {
    const price = getDisplayPrice({ amount: 220000, currency: "GEL" }, 48.5, "USD", unavailable);
    expect(price.amount).toBeNull();
    expect(price.pricePerSqm).toBeNull();
    expect(price.original).toEqual({ amount: 220000, currency: "GEL" });
  });

  it("still shows same-currency prices when the rate is unavailable", () => {
    const price = getDisplayPrice({ amount: 150000, currency: "USD" }, 65, "USD", unavailable);
    expect(price.amount).toBe(150000);
    expect(price.isConverted).toBe(false);
  });

  it("handles a converted price that rounds to zero", () => {
    const price = getDisplayPrice({ amount: 1, currency: "GEL" }, 10, "USD", available);
    expect(price.amount).toBe(0);
    expect(price.pricePerSqm).toBeNull();
  });
});

describe("getDisplayPrice for monthly rent", () => {
  it("keeps the monthly period through conversion", () => {
    const price = getDisplayPrice({ amount: 1800, currency: "GEL" }, 45, "USD", available, "month");
    // 1,800 / 2.6 = 692.31 -> 692; 692 / 45 = 15.38 per m² per month
    expect(price).toEqual({
      original: { amount: 1800, currency: "GEL" },
      currency: "USD",
      amount: 692,
      pricePerSqm: 15.38,
      isConverted: true,
      period: "month",
    });
  });

  it("keeps the period when no rate is available", () => {
    const price = getDisplayPrice(
      { amount: 1800, currency: "GEL" },
      45,
      "USD",
      unavailable,
      "month",
    );
    expect(price.amount).toBeNull();
    expect(price.period).toBe("month");
  });
});

describe("getListingDisplayPrice", () => {
  const property = {
    id: "p",
    type: "apartment" as const,
    city: "თბილისი",
    district: "x",
    areaSqm: 70,
    dataSource: "demo" as const,
  };
  const base = {
    id: "l",
    propertyId: "p",
    title: "დემო: x",
    status: "active" as const,
    dataSource: "demo" as const,
  };

  it("uses no period for a sale", () => {
    const listing = {
      ...base,
      transactionType: "sale" as const,
      askingPrice: { amount: 150000, currency: "USD" as const },
    };
    expect(getListingDisplayPrice({ listing, property }, "USD", available).period).toBeNull();
  });

  it("uses the monthly period for rent and never changes the original price", () => {
    const listing = {
      ...base,
      transactionType: "rent" as const,
      rentPeriod: "month" as const,
      askingPrice: { amount: 1200, currency: "USD" as const },
    };
    const price = getListingDisplayPrice({ listing, property }, "GEL", available);
    expect(price).toMatchObject({ amount: 3120, period: "month", isConverted: true });
    expect(listing.askingPrice).toEqual({ amount: 1200, currency: "USD" });
  });
});
