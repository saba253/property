import { describe, expect, it } from "vitest";
import {
  describeDifference,
  formatStatPerSqm,
  getAskingPriceContext,
  median,
  percentDifference,
  positionInRange,
} from "@/lib/analytics/asking-price-context";
import type { ExchangeRateState } from "@/lib/currency/exchange-rate";
import { getActiveDemoListingsWithProperties } from "@/lib/properties/get-demo-listing";
import { comparablesWithPerSqm, synthetic } from "./fixtures";

const noRate: ExchangeRateState = { status: "unavailable" };
const rate: ExchangeRateState = {
  status: "available",
  freshness: "current",
  rate: { source: "nbg", gelPerUsd: 2.5, effectiveDate: "2026-10-14", publishedAt: null },
};

describe("statistics helpers", () => {
  it("computes the median of odd and even samples without sorting the input", () => {
    const odd = [5, 1, 3];
    expect(median(odd)).toBe(3);
    expect(odd).toEqual([5, 1, 3]);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([7])).toBe(7);
    expect(() => median([])).toThrow(RangeError);
  });

  it("computes the percentage difference and refuses a zero reference", () => {
    expect(percentDifference(110, 100)).toBeCloseTo(10);
    expect(percentDifference(90, 100)).toBeCloseTo(-10);
    expect(() => percentDifference(1, 0)).toThrow(RangeError);
  });

  it("positions values on the range bar, clamped", () => {
    expect(positionInRange(15, 10, 20)).toBe(50);
    expect(positionInRange(5, 10, 20)).toBe(0);
    expect(positionInRange(25, 10, 20)).toBe(100);
    expect(positionInRange(10, 10, 10)).toBe(50);
  });

  it("rounds only for presentation, with neutral wording", () => {
    expect(formatStatPerSqm(2307.69, "USD", null)).toBe("$2,308 / მ²");
    expect(formatStatPerSqm(17.142, "USD", "month")).toBe("$17.1 / მ² / თვე");
    expect(describeDifference(12.4)).toBe("მედიანაზე 12%-ით მაღალია");
    expect(describeDifference(-7.6)).toBe("მედიანაზე 8%-ით დაბალია");
    expect(describeDifference(0.3)).toBe("მედიანასთან ახლოსაა (სხვაობა 1%-ზე ნაკლებია)");
    for (const text of [describeDifference(30), describeDifference(-30)]) {
      expect(text).not.toMatch(/იაფ|ძვირ|სამართლიან|შეფასებ|გადაფას/);
    }
  });
});

describe("asking-price context", () => {
  // Subject: $2,200 / m² (100 m², $220,000).
  const subject = synthetic("subject", { area: 100, price: 220000 });

  it("computes median, min, max, count and difference from unrounded values", () => {
    const context = getAskingPriceContext(
      subject,
      comparablesWithPerSqm([2100, 1900, 2000, 2400, 2300]),
      noRate,
    );
    expect(context.status).toBe("ready");
    if (context.status !== "ready") return;
    expect(context.scope).toBe("district");
    expect(context.byCurrency.USD).toMatchObject({
      currency: "USD",
      subjectPerSqm: 2200,
      median: 2100,
      min: 1900,
      max: 2400,
      count: 5,
      isConverted: false,
    });
    expect(context.byCurrency.USD!.differencePercent).toBeCloseTo((100 / 2100) * 100, 10);
    // No rate and every price in USD: GEL cannot be shown, USD stays reliable.
    expect(context.byCurrency.GEL).toBeNull();
  });

  it("uses an even median with six comparables", () => {
    const context = getAskingPriceContext(
      subject,
      comparablesWithPerSqm([1000, 2000, 3000, 4000, 5000, 6000]),
      noRate,
    );
    expect(context.status === "ready" && context.byCurrency.USD!.median).toBe(3500);
  });

  it("compares mixed USD and GEL prices only through one exchange rate", () => {
    // 2.5 GEL per USD: ₾5,000 / m² = $2,000 / m².
    const mixed = [
      ...comparablesWithPerSqm([1900, 2100]),
      ...[5000, 5250, 4750].map((perSqm, i) =>
        synthetic(`g${i}`, { price: perSqm * 100, currency: "GEL" }),
      ),
    ];
    const withRate = getAskingPriceContext(subject, mixed, rate);
    expect(withRate.status).toBe("ready");
    if (withRate.status !== "ready") return;
    expect(withRate.byCurrency.USD).toMatchObject({ median: 2000, min: 1900, max: 2100 });
    expect(withRate.byCurrency.USD!.isConverted).toBe(true);
    expect(withRate.byCurrency.GEL!.median).toBeCloseTo(5000);
    // The percentage does not depend on the display currency.
    expect(withRate.byCurrency.GEL!.differencePercent).toBeCloseTo(
      withRate.byCurrency.USD!.differencePercent,
    );

    // Without a rate, mixed currencies give no statistics at all.
    expect(getAskingPriceContext(subject, mixed, noRate)).toEqual({
      status: "rate-unavailable",
      scope: "district",
      period: null,
      count: 5,
    });
  });

  it("keeps monthly rent per m² separate from sale prices", () => {
    const rentSubject = synthetic("rent", { transaction: "rent", area: 50, price: 1000 });
    const rentals = [800, 900, 1000, 1100, 1200].map((price, i) =>
      synthetic(`r${i}`, { transaction: "rent", area: 50, price }),
    );
    const context = getAskingPriceContext(
      rentSubject,
      [...rentals, ...comparablesWithPerSqm([1, 2, 3, 4, 5])],
      noRate,
    );
    expect(context.status === "ready" && context.period).toBe("month");
    expect(context.status === "ready" && context.byCurrency.USD).toMatchObject({
      subjectPerSqm: 20,
      median: 20,
      min: 16,
      max: 24,
      count: 5,
    });
  });

  it("returns no statistics with fewer than five comparables or invalid data", () => {
    expect(getAskingPriceContext(subject, comparablesWithPerSqm([1, 2, 3, 4]), rate)).toEqual({
      status: "insufficient",
      period: null,
      districtCount: 4,
      cityCount: 4,
    });
    expect(getAskingPriceContext(subject, [], rate)).toMatchObject({ status: "insufficient" });
    expect(getAskingPriceContext(synthetic("zero", { area: 0 }), [], rate)).toEqual({
      status: "invalid-subject",
    });
  });

  it("never changes original prices or the input", () => {
    const candidates = comparablesWithPerSqm([2100, 1900, 2000, 2400, 2300], {
      currency: "GEL",
    });
    const before = structuredClone([subject, ...candidates]);
    const first = getAskingPriceContext(subject, candidates, rate);
    const second = getAskingPriceContext(subject, [...candidates].reverse(), rate);
    expect([subject, ...candidates]).toEqual(before);
    expect(first).toEqual(second);
    if (first.status !== "ready") throw new Error("expected ready");
    expect(first.comparables.map((item) => item.listing.askingPrice)).toEqual(
      candidates.map((item) => item.listing.askingPrice),
    );
  });
});

describe("demo data", () => {
  it("has too few similar demo listings for statistics, and none are invented", () => {
    const items = getActiveDemoListingsWithProperties();
    for (const item of items) {
      const context = getAskingPriceContext(item, items, rate);
      expect(["insufficient", "invalid-subject"]).toContain(context.status);
    }
    expect(items.every((item) => item.listing.dataSource === "demo")).toBe(true);
  });
});
