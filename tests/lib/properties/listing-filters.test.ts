import { describe, expect, it } from "vitest";
import type { ExchangeRateState } from "@/lib/currency/exchange-rate";
import { getDisplayPrice } from "@/lib/pricing/display-price";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import {
  type ListingFilters,
  convertBudgetForDisplay,
  filterListings,
  hasActiveFilters,
  parseDisplayCurrency,
  parseListingFilters,
  parseNonNegativeNumber,
} from "@/lib/properties/listing-filters";

// Fixture rate with easy arithmetic, not a claim about any current rate.
const rate: ExchangeRateState = {
  status: "available",
  freshness: "current",
  rate: { source: "nbg", gelPerUsd: 2.6, effectiveDate: "2026-10-10", publishedAt: null },
};
const noRate: ExchangeRateState = { status: "unavailable" };

function item(
  id: string,
  city: string,
  areaSqm: number,
  amount: number,
  currency: "USD" | "GEL",
  status: "active" | "inactive" = "active",
): ListingWithProperty {
  return {
    listing: {
      id,
      propertyId: `p-${id}`,
      title: `დემო: ${id}`,
      askingPrice: { amount, currency },
      status,
      dataSource: "demo",
    },
    property: { id: `p-${id}`, city, district: "x", areaSqm, dataSource: "demo" },
  };
}

// usd: $150,000 = ₾390,000. gel: ₾220,000 ≈ $84,615. cheapGel: ₾50,000 ≈ $19,231.
const items = [
  item("usd", "თბილისი", 65, 150000, "USD"),
  item("gel", "ბათუმი", 48.5, 220000, "GEL"),
  item("cheapGel", "თბილისი", 30, 50000, "GEL"),
];

function ids(result: { matches: ListingWithProperty[] }): string[] {
  return result.matches.map((match) => match.listing.id);
}

function run(filters: ListingFilters, display: "USD" | "GEL" = "USD", state = rate) {
  return filterListings(items, filters, display, state);
}

describe("parseNonNegativeNumber", () => {
  it("accepts integers, decimals, and thousands separators", () => {
    expect(parseNonNegativeNumber("150000")).toBe(150000);
    expect(parseNonNegativeNumber("48.5")).toBe(48.5);
    expect(parseNonNegativeNumber("150,000")).toBe(150000);
    expect(parseNonNegativeNumber("150 000")).toBe(150000);
  });

  it("rejects negative, non-numeric, and special values", () => {
    for (const value of ["-5", "abc", "1e5", "Infinity", "NaN", "12abc", "1.2.3", "0x10"]) {
      expect(parseNonNegativeNumber(value)).toBeNull();
    }
  });
});

describe("parseDisplayCurrency", () => {
  it("defaults to USD", () => {
    expect(parseDisplayCurrency({})).toEqual({ display: "USD", issue: null });
  });

  it("accepts GEL in any letter case", () => {
    expect(parseDisplayCurrency({ display: "gel" }).display).toBe("GEL");
  });

  it("falls back to USD and reports an invalid value", () => {
    expect(parseDisplayCurrency({ display: "EUR" })).toEqual({
      display: "USD",
      issue: { code: "invalid-display-currency" },
    });
  });
});

describe("parseListingFilters", () => {
  it("returns no filters, USD display, and no issues for an empty query", () => {
    expect(parseListingFilters({})).toEqual({ filters: {}, display: "USD", issues: [] });
  });

  it("treats empty values as not set", () => {
    const result = parseListingFilters({
      city: "",
      currency: " ",
      display: "",
      minPrice: "",
      maxArea: "",
    });
    expect(result).toEqual({ filters: {}, display: "USD", issues: [] });
  });

  it("parses a complete valid query", () => {
    const result = parseListingFilters({
      city: "tbilisi",
      currency: "GEL",
      display: "GEL",
      minPrice: "100000",
      maxPrice: "200000",
      minArea: "40",
      maxArea: "80",
    });
    expect(result.issues).toEqual([]);
    expect(result.display).toBe("GEL");
    expect(result.filters).toEqual({
      citySlug: "tbilisi",
      originalCurrency: "GEL",
      minPrice: 100000,
      maxPrice: 200000,
      minArea: 40,
      maxArea: 80,
    });
  });

  it("keeps price limits without any currency parameter (budget is in USD by default)", () => {
    const result = parseListingFilters({ minPrice: "100000", maxPrice: "300000" });
    expect(result.filters).toEqual({ minPrice: 100000, maxPrice: 300000 });
    expect(result.display).toBe("USD");
    expect(result.issues).toEqual([]);
  });

  it("normalizes letter case of city and original currency", () => {
    const { filters } = parseListingFilters({ city: "Batumi", currency: "gel" });
    expect(filters).toEqual({ citySlug: "batumi", originalCurrency: "GEL" });
  });

  it("uses the first value of a repeated parameter", () => {
    const { filters } = parseListingFilters({ city: ["batumi", "tbilisi"] });
    expect(filters.citySlug).toBe("batumi");
  });

  it("drops and reports an unknown city, original currency, or display currency", () => {
    const result = parseListingFilters({ city: "paris", currency: "EUR", display: "JPY" });
    expect(result.filters).toEqual({});
    expect(result.display).toBe("USD");
    expect(result.issues).toEqual([
      { code: "invalid-city" },
      { code: "invalid-currency" },
      { code: "invalid-display-currency" },
    ]);
  });

  it("drops and reports invalid numbers", () => {
    const result = parseListingFilters({ minArea: "-10", maxArea: "abc" });
    expect(result.filters).toEqual({});
    expect(result.issues).toEqual([
      { code: "invalid-number", field: "minArea" },
      { code: "invalid-number", field: "maxArea" },
    ]);
  });

  it("swaps inverted area and price ranges", () => {
    const area = parseListingFilters({ minArea: "80", maxArea: "40" });
    expect(area.filters).toEqual({ minArea: 40, maxArea: 80 });
    expect(area.issues).toEqual([{ code: "swapped-area-range" }]);

    const price = parseListingFilters({ minPrice: "200000", maxPrice: "1" });
    expect(price.filters).toEqual({ minPrice: 1, maxPrice: 200000 });
    expect(price.issues).toEqual([{ code: "swapped-price-range" }]);
  });
});

describe("hasActiveFilters", () => {
  it("is false for no filters and true for any filter", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ minArea: 0 })).toBe(true);
  });
});

describe("filterListings", () => {
  it("returns every active listing when no filters are set", () => {
    expect(ids(run({}))).toEqual(["usd", "gel", "cheapGel"]);
  });

  it("filters by city, original currency, and area", () => {
    expect(ids(run({ citySlug: "batumi" }))).toEqual(["gel"]);
    expect(ids(run({ originalCurrency: "GEL" }))).toEqual(["gel", "cheapGel"]);
    expect(ids(run({ minArea: 40, maxArea: 60 }))).toEqual(["gel"]);
  });

  it("matches a GEL listing against a USD budget (default display)", () => {
    // ₾50,000 ≈ $19,231 fits "up to $20,000"; the others do not.
    expect(ids(run({ maxPrice: 20000 }))).toEqual(["cheapGel"]);
  });

  it("matches a USD listing against a GEL budget", () => {
    // $150,000 = ₾390,000; ₾220,000 and ₾50,000 are below the minimum.
    expect(ids(run({ minPrice: 300000 }, "GEL"))).toEqual(["usd"]);
    // "Up to ₾20,000" matches nothing.
    expect(ids(run({ maxPrice: 20000 }, "GEL"))).toEqual([]);
  });

  it("includes listings exactly on the rounded display price boundary", () => {
    // ₾220,000 / 2.6 = 84,615.38, shown as $84,615.
    expect(ids(run({ minPrice: 84615, maxPrice: 84615 }))).toEqual(["gel"]);
    expect(ids(run({ maxPrice: 84614 }))).toEqual(["cheapGel"]);
    expect(ids(run({ minPrice: 84616, maxPrice: 100000 }))).toEqual([]);
  });

  it("agrees with the displayed price for every listing and budget", () => {
    for (const display of ["USD", "GEL"] as const) {
      for (const maxPrice of [19230, 19231, 84615, 150000, 390000]) {
        const matched = new Set(ids(run({ maxPrice }, display)));
        for (const { listing, property } of items) {
          const shown = getDisplayPrice(listing.askingPrice, property.areaSqm, display, rate);
          expect(matched.has(listing.id)).toBe(shown.amount !== null && shown.amount <= maxPrice);
        }
      }
    }
  });

  it("does not report missing comparisons when the rate is available", () => {
    expect(run({ maxPrice: 20000 }).notComparableCount).toBe(0);
  });

  it("without a rate, compares only same-currency listings and counts the rest", () => {
    const result = run({ maxPrice: 200000 }, "USD", noRate);
    expect(ids(result)).toEqual(["usd"]);
    expect(result.notComparableCount).toBe(2);
  });

  it("without a rate, still applies non-price filters to every listing", () => {
    const result = run({ citySlug: "tbilisi" }, "USD", noRate);
    expect(ids(result)).toEqual(["usd", "cheapGel"]);
    expect(result.notComparableCount).toBe(0);
  });

  it("only counts not-comparable listings that passed the other filters", () => {
    const result = run({ citySlug: "batumi", maxPrice: 1 }, "USD", noRate);
    expect(result.notComparableCount).toBe(1);
  });

  it("never returns inactive listings", () => {
    const inactive = item("inactive", "თბილისი", 50, 1000, "USD", "inactive");
    expect(ids(filterListings([...items, inactive], {}, "USD", rate))).not.toContain("inactive");
  });
});

describe("convertBudgetForDisplay", () => {
  it("converts the budget when switching display currency", () => {
    expect(convertBudgetForDisplay({ maxPrice: 100000 }, "USD", "GEL", rate)).toEqual({
      maxPrice: 260000,
    });
    expect(
      convertBudgetForDisplay({ minPrice: 26000, maxPrice: 260000 }, "GEL", "USD", rate),
    ).toEqual({ minPrice: 10000, maxPrice: 100000 });
  });

  it("leaves filters unchanged for the same currency or no budget", () => {
    const filters = { citySlug: "batumi", maxPrice: 5 };
    expect(convertBudgetForDisplay(filters, "USD", "USD", rate)).toBe(filters);
    const noBudget = { citySlug: "batumi" };
    expect(convertBudgetForDisplay(noBudget, "USD", "GEL", rate)).toBe(noBudget);
  });

  it("drops the budget instead of reinterpreting it when no rate is available", () => {
    expect(
      convertBudgetForDisplay({ citySlug: "batumi", maxPrice: 100000 }, "USD", "GEL", noRate),
    ).toEqual({ citySlug: "batumi", minPrice: undefined, maxPrice: undefined });
  });
});
