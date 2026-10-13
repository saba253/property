import { describe, expect, it } from "vitest";
import type { ExchangeRateState } from "@/lib/currency/exchange-rate";
import { getDisplayPrice } from "@/lib/pricing/display-price";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import type { Listing, Property } from "@/lib/properties/types";

/** Loose overrides for fixtures; the result is cast to the real union types. */
type Overrides = Record<string, unknown>;
import {
  type ListingFilters,
  convertBudgetForDisplay,
  countAdvancedFilters,
  filterListings,
  getTransaction,
  hasActiveFilters,
  parseDisplayCurrency,
  parseListingFilters,
  parseNonNegativeNumber,
  switchTransaction,
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
  extra: { property?: Overrides; listing?: Overrides } = {},
): ListingWithProperty {
  return {
    listing: {
      id,
      propertyId: `p-${id}`,
      title: `დემო: ${id}`,
      transactionType: "sale",
      askingPrice: { amount, currency },
      status,
      dataSource: "demo",
      ...extra.listing,
    } as Listing,
    property: {
      id: `p-${id}`,
      type: "apartment",
      city,
      district: "x",
      areaSqm,
      dataSource: "demo",
      ...extra.property,
    } as Property,
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

// Structural facts and amenities. "unknownFacts" states nothing, to test unknown handling.
const detailed = [
  item("big", "თბილისი", 92, 185000, "USD", "active", {
    property: {
      bedrooms: 3,
      bathrooms: 2,
      floor: 10,
      features: { balcony: "yes", parking: "yes", elevator: "yes" },
    },
    listing: { equipment: { refrigerator: "yes", dishwasher: "yes" } },
  }),
  item("studio", "ბათუმი", 38, 62000, "USD", "active", {
    property: { bedrooms: 0, bathrooms: 1, floor: 21, features: { balcony: "yes", parking: "no" } },
    listing: { equipment: { refrigerator: "yes", dishwasher: "no" } },
  }),
  item("unknownFacts", "თბილისი", 54, 165000, "GEL"),
];

function runDetailed(filters: ListingFilters) {
  return ids(filterListings(detailed, filters, "USD", rate));
}

describe("parseListingFilters: structure and amenities", () => {
  it("parses bedrooms, bathrooms, floor range, and amenities", () => {
    const result = parseListingFilters({
      minBedrooms: "2",
      minBathrooms: "1",
      minFloor: "3",
      maxFloor: "12",
      amenity: ["parking", "balcony"],
    });
    expect(result.issues).toEqual([]);
    expect(result.filters).toEqual({
      minBedrooms: 2,
      minBathrooms: 1,
      minFloor: 3,
      maxFloor: 12,
      amenities: ["balcony", "parking"],
    });
  });

  it("accepts a single amenity value and removes duplicates", () => {
    expect(parseListingFilters({ amenity: "elevator" }).filters.amenities).toEqual(["elevator"]);
    expect(parseListingFilters({ amenity: ["elevator", "elevator"] }).filters.amenities).toEqual([
      "elevator",
    ]);
  });

  it("drops unknown amenities and reports them", () => {
    const result = parseListingFilters({ amenity: ["pool", "balcony", ""] });
    expect(result.filters.amenities).toEqual(["balcony"]);
    expect(result.issues).toEqual([{ code: "invalid-amenity" }]);
  });

  it("rejects non-integer or out-of-range counts", () => {
    const result = parseListingFilters({
      minBedrooms: "2.5",
      minBathrooms: "0",
      minFloor: "-1",
      maxFloor: "999",
    });
    expect(result.filters).toEqual({});
    expect(result.issues).toEqual([
      { code: "invalid-number", field: "minBedrooms" },
      { code: "invalid-number", field: "minBathrooms" },
      { code: "invalid-number", field: "minFloor" },
      { code: "invalid-number", field: "maxFloor" },
    ]);
  });

  it("allows zero bedrooms (studio) and swaps an inverted floor range", () => {
    const result = parseListingFilters({ minBedrooms: "0", minFloor: "10", maxFloor: "2" });
    expect(result.filters).toEqual({ minBedrooms: 0, minFloor: 2, maxFloor: 10 });
    expect(result.issues).toEqual([{ code: "swapped-floor-range" }]);
  });
});

describe("countAdvancedFilters", () => {
  it("counts structural filters and each amenity", () => {
    expect(countAdvancedFilters({})).toBe(0);
    expect(countAdvancedFilters({ citySlug: "batumi", maxPrice: 1 })).toBe(0);
    expect(
      countAdvancedFilters({
        minBedrooms: 1,
        minFloor: 2,
        maxFloor: 5,
        amenities: ["bed", "balcony"],
      }),
    ).toBe(4);
  });
});

describe("filterListings: structure and amenities", () => {
  it("filters by minimum bedrooms and bathrooms", () => {
    expect(runDetailed({ minBedrooms: 2 })).toEqual(["big"]);
    expect(runDetailed({ minBedrooms: 0 })).toEqual(["big", "studio"]);
    expect(runDetailed({ minBathrooms: 2 })).toEqual(["big"]);
  });

  it("filters by floor range, including the boundaries", () => {
    expect(runDetailed({ minFloor: 10, maxFloor: 21 })).toEqual(["big", "studio"]);
    expect(runDetailed({ maxFloor: 10 })).toEqual(["big"]);
    expect(runDetailed({ minFloor: 11 })).toEqual(["studio"]);
  });

  it("never matches unknown structural values", () => {
    const cases: ListingFilters[] = [
      { minBedrooms: 0 },
      { minBathrooms: 1 },
      { minFloor: 0 },
      { maxFloor: 99 },
    ];
    for (const filters of cases) {
      expect(runDetailed(filters)).not.toContain("unknownFacts");
    }
  });

  it("uses AND matching across property features and listing equipment", () => {
    expect(runDetailed({ amenities: ["balcony"] })).toEqual(["big", "studio"]);
    expect(runDetailed({ amenities: ["balcony", "parking"] })).toEqual(["big"]);
    expect(runDetailed({ amenities: ["refrigerator", "dishwasher"] })).toEqual(["big"]);
    expect(runDetailed({ amenities: ["balcony", "elevator", "dishwasher"] })).toEqual(["big"]);
  });

  it("does not treat unknown amenities as matches", () => {
    expect(runDetailed({ amenities: ["elevator"] })).toEqual(["big"]);
    expect(runDetailed({ amenities: ["television"] })).toEqual([]);
  });

  it("combines structural, amenity, and budget filters", () => {
    expect(runDetailed({ amenities: ["balcony"], maxPrice: 100000 })).toEqual(["studio"]);
    expect(runDetailed({ minBedrooms: 1, amenities: ["balcony"], maxPrice: 100000 })).toEqual([]);
  });
});

// Sale and rent, apartments and houses. Rents are monthly; fixture rate 1 USD = 2.6 GEL.
const mixed = [
  item("saleFlat", "თბილისი", 65, 150000, "USD", "active", {
    property: { floor: 5, features: { elevator: "yes", balcony: "yes" } },
  }),
  item("saleHouse", "თბილისი", 180, 320000, "USD", "active", {
    property: { type: "house", storeys: 2, landAreaSqm: 400, features: { balcony: "yes" } },
  }),
  item("rentFlat", "ბათუმი", 45, 1800, "GEL", "active", {
    property: { floor: 15, features: { elevator: "yes", balcony: "yes" } },
    listing: { transactionType: "rent", rentPeriod: "month" },
  }),
  item("rentHouse", "თბილისი", 220, 2500, "USD", "active", {
    property: { type: "house", storeys: 2, features: { balcony: "yes" } },
    listing: { transactionType: "rent", rentPeriod: "month" },
  }),
];

function runMixed(filters: ListingFilters, display: "USD" | "GEL" = "USD", state = rate) {
  return ids(filterListings(mixed, filters, display, state));
}

describe("parseListingFilters: transaction and property type", () => {
  it("defaults to For Sale and keeps it implicit", () => {
    expect(parseListingFilters({}).filters.transaction).toBeUndefined();
    expect(parseListingFilters({ transaction: "sale" }).filters).toEqual({});
    expect(getTransaction({})).toBe("sale");
  });

  it("parses For Rent and property types in any letter case", () => {
    const { filters, issues } = parseListingFilters({ transaction: "RENT", type: "House" });
    expect(filters).toEqual({ transaction: "rent", propertyType: "house" });
    expect(issues).toEqual([]);
  });

  it("rejects 'all' and unknown values, falling back to For Sale and every type", () => {
    const result = parseListingFilters({ transaction: "all", type: "land" });
    expect(result.filters).toEqual({});
    expect(result.issues).toEqual([
      { code: "invalid-transaction" },
      { code: "invalid-property-type" },
    ]);
  });

  it("drops a floor range for private houses with a notice", () => {
    const result = parseListingFilters({ type: "house", minFloor: "2", maxFloor: "9" });
    expect(result.filters).toEqual({ propertyType: "house" });
    expect(result.issues).toEqual([{ code: "floor-not-applicable" }]);
  });

  it("keeps a floor range for apartments and for any type", () => {
    expect(parseListingFilters({ type: "apartment", minFloor: "2" }).filters).toEqual({
      propertyType: "apartment",
      minFloor: 2,
    });
    expect(parseListingFilters({ minFloor: "2" }).issues).toEqual([]);
  });

  it("drops apartment-only amenities for houses but keeps the others", () => {
    const result = parseListingFilters({ type: "house", amenity: ["elevator", "parking"] });
    expect(result.filters.amenities).toEqual(["parking"]);
    expect(result.issues).toEqual([{ code: "amenity-not-applicable", amenity: "elevator" }]);
    const only = parseListingFilters({ type: "house", amenity: "elevator" });
    expect(only.filters.amenities).toBeUndefined();
  });
});

describe("hasActiveFilters with transaction", () => {
  it("does not treat the sale/rent choice as a filter to reset", () => {
    expect(hasActiveFilters({ transaction: "rent" })).toBe(false);
    expect(hasActiveFilters({ transaction: "rent", propertyType: "house" })).toBe(true);
  });
});

describe("filterListings: transaction and property type", () => {
  it("shows only sale listings by default", () => {
    expect(runMixed({})).toEqual(["saleFlat", "saleHouse"]);
  });

  it("shows only rent listings for For Rent", () => {
    expect(runMixed({ transaction: "rent" })).toEqual(["rentFlat", "rentHouse"]);
  });

  it("filters by property type within the transaction", () => {
    expect(runMixed({ propertyType: "house" })).toEqual(["saleHouse"]);
    expect(runMixed({ transaction: "rent", propertyType: "apartment" })).toEqual(["rentFlat"]);
  });

  it("never compares a monthly rent budget with sale prices", () => {
    // A $3,000 budget: no sale price fits, and sale listings are never considered for rent.
    expect(runMixed({ maxPrice: 3000 })).toEqual([]);
    expect(runMixed({ transaction: "rent", maxPrice: 3000 })).toEqual(["rentFlat", "rentHouse"]);
  });

  it("compares monthly rent across currencies", () => {
    // ₾1,800 / 2.6 = $692 per month.
    expect(runMixed({ transaction: "rent", maxPrice: 692 })).toEqual(["rentFlat"]);
    expect(runMixed({ transaction: "rent", maxPrice: 691 })).toEqual([]);
    // $2,500 = ₾6,500 per month.
    expect(runMixed({ transaction: "rent", minPrice: 6500 }, "GEL")).toEqual(["rentHouse"]);
  });

  it("never matches a house on floor or elevator filters", () => {
    expect(runMixed({ minFloor: 0 })).toEqual(["saleFlat"]);
    expect(runMixed({ amenities: ["elevator"] })).toEqual(["saleFlat"]);
    expect(runMixed({ transaction: "rent", amenities: ["elevator"] })).toEqual(["rentFlat"]);
  });

  it("combines with city, area, and amenity filters", () => {
    expect(runMixed({ citySlug: "tbilisi", amenities: ["balcony"] })).toEqual([
      "saleFlat",
      "saleHouse",
    ]);
    expect(runMixed({ transaction: "rent", citySlug: "tbilisi", minArea: 200 })).toEqual([
      "rentHouse",
    ]);
  });

  it("without a rate, compares rent only within the display currency and counts the rest", () => {
    const result = filterListings(mixed, { transaction: "rent", maxPrice: 3000 }, "USD", noRate);
    expect(ids(result)).toEqual(["rentHouse"]);
    expect(result.notComparableCount).toBe(1);
  });
});

describe("switchTransaction", () => {
  it("keeps compatible filters and drops the budget", () => {
    const filters: ListingFilters = {
      propertyType: "apartment",
      citySlug: "batumi",
      minArea: 40,
      minBedrooms: 1,
      amenities: ["balcony"],
      minPrice: 50000,
      maxPrice: 200000,
    };
    expect(switchTransaction(filters, "rent")).toEqual({
      ...filters,
      transaction: "rent",
      minPrice: undefined,
      maxPrice: undefined,
    });
  });

  it("returns to the implicit default when switching back to sale", () => {
    const back = switchTransaction({ transaction: "rent", maxPrice: 900 }, "sale");
    expect(back.transaction).toBeUndefined();
    expect(back.maxPrice).toBeUndefined();
  });

  it("changes nothing when the transaction stays the same", () => {
    const filters: ListingFilters = { maxPrice: 900 };
    expect(switchTransaction(filters, "sale")).toBe(filters);
  });
});

describe("rooms and district filters", () => {
  const roomy = [
    item("one", "თბილისი", 30, 50000, "USD", "active", {
      property: { rooms: 1, district: "ვაკე" },
    }),
    item("two", "თბილისი", 50, 80000, "USD", "active", {
      property: { rooms: 2, district: "ვაკე" },
    }),
    item("five", "ბათუმი", 120, 200000, "USD", "active", { property: { rooms: 5 } }),
    item("six", "ბათუმი", 150, 250000, "USD", "active", { property: { rooms: 6 } }),
    item("unknown", "თბილისი", 40, 60000, "USD"),
  ];
  const run = (filters: ListingFilters) => ids(filterListings(roomy, filters, "USD", rate));

  it("parses rooms 1-5 and rejects other values", () => {
    expect(parseListingFilters({ rooms: "2" }).filters).toEqual({ rooms: 2 });
    expect(parseListingFilters({ rooms: "5" }).filters).toEqual({ rooms: 5 });
    for (const value of ["0", "6", "2.5", "two"]) {
      expect(parseListingFilters({ rooms: value }).issues).toEqual([
        { code: "invalid-number", field: "rooms" },
      ]);
    }
  });

  it("matches rooms exactly for 1-4 and five-or-more for 5", () => {
    expect(run({ rooms: 2 })).toEqual(["two"]);
    expect(run({ rooms: 5 })).toEqual(["five", "six"]);
  });

  it("never matches an unknown room count", () => {
    expect(run({ rooms: 1 })).not.toContain("unknown");
  });

  it("validates districts against the known list from the data", () => {
    expect(parseListingFilters({ district: "ვაკე" }, { knownDistricts: ["ვაკე"] }).filters).toEqual(
      {
        district: "ვაკე",
      },
    );
    const unknown = parseListingFilters({ district: "მთაწმინდა" }, { knownDistricts: ["ვაკე"] });
    expect(unknown.filters).toEqual({});
    expect(unknown.issues).toEqual([{ code: "invalid-district" }]);
  });

  it("filters by district and counts rooms and district as advanced filters", () => {
    expect(run({ district: "ვაკე" })).toEqual(["one", "two"]);
    // District sits next to the city in the main row; original currency is in "more filters".
    expect(countAdvancedFilters({ rooms: 2, district: "ვაკე" })).toBe(1);
    expect(countAdvancedFilters({ rooms: 2, originalCurrency: "GEL" })).toBe(2);
  });
});
