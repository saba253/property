import { describe, expect, it } from "vitest";
import type { ExchangeRateState } from "@/lib/currency/exchange-rate";
import { getListingDisplayPrice } from "@/lib/pricing/display-price";
import { getDistrictsPresentIn } from "@/lib/properties/cities";
import { buildListingsHref, getFilterChips } from "@/lib/properties/filter-chips";
import {
  type ListingWithProperty,
  getActiveDemoListingsWithProperties,
} from "@/lib/properties/get-demo-listing";
import { filterListings, parseListingFilters } from "@/lib/properties/listing-filters";
import {
  SORT_OPTIONS,
  type SortOption,
  parseSort,
  sortListings,
} from "@/lib/properties/listing-sort";
import { toMapListing } from "@/lib/map/map-listings";
import type { Currency } from "@/lib/properties/types";

// Fixture rate with easy arithmetic, not a claim about any current rate.
const rate: ExchangeRateState = {
  status: "available",
  freshness: "current",
  rate: { source: "nbg", gelPerUsd: 2.5, effectiveDate: "2026-10-10", publishedAt: null },
};
const noRate: ExchangeRateState = { status: "unavailable" };

function listing(
  id: string,
  amount: number,
  currency: Currency,
  areaSqm: number,
  transactionType: "sale" | "rent" = "sale",
): ListingWithProperty {
  const base = {
    id,
    propertyId: `p-${id}`,
    title: id,
    askingPrice: { amount, currency },
    status: "active" as const,
    dataSource: "demo" as const,
  };
  return {
    property: {
      id: `p-${id}`,
      type: "apartment",
      city: "თბილისი",
      district: "ვაკე",
      areaSqm,
      dataSource: "demo",
    },
    listing:
      transactionType === "sale"
        ? { ...base, transactionType: "sale" }
        : { ...base, transactionType: "rent", rentPeriod: "month" },
  };
}

// a: $100,000 / 50 m² = $2,000/m²   b: ₾200,000 = $80,000 / 80 m² = $1,000/m²
// c: $120,000 / 40 m² = $3,000/m²   d: ₾300,000 = $120,000 / 60 m² = $2,000/m²
const items = [
  listing("a", 100_000, "USD", 50),
  listing("b", 200_000, "GEL", 80),
  listing("c", 120_000, "USD", 40),
  listing("d", 300_000, "GEL", 60),
];
const ids = (list: readonly ListingWithProperty[]) => list.map((item) => item.listing.id);
const sortIds = (sort: SortOption, state: ExchangeRateState = rate, list = items) =>
  ids(sortListings(list, sort, state).items);

describe("sortListings", () => {
  it("keeps the existing order by default", () => {
    expect(sortIds("default")).toEqual(["a", "b", "c", "d"]);
  });

  it("sorts by price across USD and GEL using the exchange rate, with stable ties", () => {
    // c and d are both $120,000: equal, so they keep their original order.
    expect(sortIds("price_asc")).toEqual(["b", "a", "c", "d"]);
    expect(sortIds("price_desc")).toEqual(["c", "d", "a", "b"]);
  });

  it("sorts by area", () => {
    expect(sortIds("area_asc")).toEqual(["c", "a", "d", "b"]);
    expect(sortIds("area_desc")).toEqual(["b", "d", "a", "c"]);
  });

  it("sorts by asking price per m², with stable ties", () => {
    // a and d are both $2,000/m².
    expect(sortIds("price_per_sqm_asc")).toEqual(["b", "a", "d", "c"]);
    expect(sortIds("price_per_sqm_desc")).toEqual(["c", "a", "d", "b"]);
  });

  it("agrees with the displayed prices in both currencies", () => {
    for (const display of ["USD", "GEL"] as const) {
      const amounts = sortListings(items, "price_asc", rate).items.map(
        (item) => getListingDisplayPrice(item, display, rate).amount!,
      );
      expect(amounts).toEqual([...amounts].sort((x, y) => x - y));
    }
  });

  it("never compares monthly rent with sale prices", () => {
    const mixed = [
      listing("sale-big", 500_000, "USD", 100),
      listing("rent-small", 900, "USD", 50, "rent"),
      listing("sale-small", 50_000, "USD", 40),
      listing("rent-big", 3_000, "USD", 120, "rent"),
    ];
    expect(sortIds("price_asc", rate, mixed)).toEqual([
      "sale-small",
      "sale-big",
      "rent-small",
      "rent-big",
    ]);
  });

  it("sorts monthly rents by their monthly amount", () => {
    const rents = [
      listing("r1", 1_200, "USD", 60, "rent"),
      listing("r2", 2_000, "GEL", 50, "rent"), // $800
      listing("r3", 2_500, "USD", 120, "rent"),
    ];
    expect(sortIds("price_asc", rate, rents)).toEqual(["r2", "r1", "r3"]);
    // $/m²: r1 = 20, r2 = 16, r3 ≈ 20.83.
    expect(sortIds("price_per_sqm_desc", rate, rents)).toEqual(["r3", "r1", "r2"]);
  });

  it("does not invent a cross-currency order without an exchange rate", () => {
    const result = sortListings(items, "price_asc", noRate);
    expect(ids(result.items)).toEqual(["a", "b", "c", "d"]);
    expect(result.applied).toBe("default");
    expect(result.notice).toBe("rate-unavailable");
    // Area needs no rate.
    expect(sortListings(items, "area_desc", noRate)).toMatchObject({
      applied: "area_desc",
      notice: null,
    });
  });

  it("still sorts by price without a rate when all prices share one currency", () => {
    const gelOnly = [listing("x", 300_000, "GEL", 60), listing("y", 200_000, "GEL", 80)];
    expect(sortListings(gelOnly, "price_asc", noRate)).toMatchObject({
      applied: "price_asc",
      notice: null,
    });
    expect(sortIds("price_asc", noRate, gelOnly)).toEqual(["y", "x"]);
  });

  it("puts listings without a comparable value last in both directions", () => {
    const withBad = [listing("zero", 100_000, "USD", 0), ...items];
    expect(sortIds("area_asc", rate, withBad).at(-1)).toBe("zero");
    expect(sortIds("area_desc", rate, withBad).at(-1)).toBe("zero");
    expect(sortIds("price_per_sqm_asc", rate, withBad).at(-1)).toBe("zero");
    expect(sortIds("price_per_sqm_desc", rate, withBad).at(-1)).toBe("zero");
    // Price itself is still comparable for that listing.
    expect(sortIds("price_asc", rate, withBad)).toContain("zero");
  });

  it("returns a new array and does not change the input", () => {
    const input = [...items];
    const result = sortListings(input, "price_desc", rate);
    expect(result.items).not.toBe(input);
    expect(ids(input)).toEqual(["a", "b", "c", "d"]);
    expect(sortListings(input, "default", rate).items).not.toBe(input);
  });
});

describe("sort URL state", () => {
  it("offers seven options, each with a Georgian label, that round-trip through the URL", () => {
    expect(SORT_OPTIONS.map((option) => option.value)).toEqual([
      "default",
      "price_asc",
      "price_desc",
      "area_asc",
      "area_desc",
      "price_per_sqm_asc",
      "price_per_sqm_desc",
    ]);
    for (const option of SORT_OPTIONS) {
      expect(option.label).toMatch(/[ა-ჿ]/);
      const url = new URL(buildListingsHref({}, "USD", "list", option.value), "http://x");
      expect(parseSort(Object.fromEntries(url.searchParams)).sort).toBe(option.value);
    }
  });

  it("parses valid values and falls back safely", () => {
    expect(parseSort({})).toEqual({ sort: "default", invalid: false });
    expect(parseSort({ sort: "PRICE_ASC" })).toEqual({ sort: "price_asc", invalid: false });
    expect(parseSort({ sort: ["area_desc", "price_asc"] })).toEqual({
      sort: "area_desc",
      invalid: false,
    });
    expect(parseSort({ sort: "newest" })).toEqual({ sort: "default", invalid: true });
    expect(parseSort({ sort: "default" })).toEqual({ sort: "default", invalid: true });
  });

  it("keeps legacy URLs unchanged and adds sort only when chosen", () => {
    expect(buildListingsHref({ citySlug: "tbilisi" })).toBe("/properties?city=tbilisi");
    expect(buildListingsHref({ citySlug: "tbilisi" }, "USD", "list", "default")).toBe(
      "/properties?city=tbilisi",
    );
    expect(buildListingsHref({ citySlug: "tbilisi" }, "GEL", "map", "price_desc")).toBe(
      "/properties?display=GEL&view=map&sort=price_desc&city=tbilisi",
    );
  });

  it("keeps sort and view when a filter chip is removed", () => {
    for (const chip of getFilterChips(
      { citySlug: "tbilisi", rooms: 2 },
      "USD",
      "map",
      "area_asc",
    )) {
      expect(chip.removeHref).toContain("sort=area_asc");
      expect(chip.removeHref).toContain("view=map");
    }
  });

  it("does not treat sort as a filter", () => {
    const parsed = parseListingFilters({ sort: "price_asc", city: "tbilisi" });
    expect(parsed.filters).toEqual({ citySlug: "tbilisi" });
    expect(parsed.issues).toEqual([]);
  });
});

describe("filtering, then sorting, for list and map", () => {
  const all = getActiveDemoListingsWithProperties();
  const knownDistricts = getDistrictsPresentIn(all.map((item) => item.property));

  function pipeline(query: Record<string, string>) {
    const { filters, display } = parseListingFilters(query, { knownDistricts });
    const { matches } = filterListings(all, filters, display, rate);
    const { sort } = parseSort(query);
    const sorted = sortListings(matches, sort, rate).items;
    return { matches, sorted, display };
  }

  it("sorts only the filtered results", () => {
    const { matches, sorted } = pipeline({ city: "tbilisi", sort: "price_desc" });
    expect(new Set(ids(sorted))).toEqual(new Set(ids(matches)));
    expect(sorted.every((item) => item.property.city === "თბილისი")).toBe(true);
  });

  it("orders demo sale listings by USD-equivalent price", () => {
    const { sorted } = pipeline({ sort: "price_asc" });
    const usd = sorted.map((item) => getListingDisplayPrice(item, "USD", rate).amount!);
    expect(usd).toEqual([...usd].sort((x, y) => x - y));
    expect(sorted.every((item) => item.listing.transactionType === "sale")).toBe(true);
  });

  it("gives the map results panel exactly the same order as the list", () => {
    const { sorted, display } = pipeline({ transaction: "rent", sort: "price_per_sqm_desc" });
    const mapIds = sorted.map(
      (item) =>
        toMapListing(item, {
          price: getListingDisplayPrice(item, display, rate),
          href: "",
          coverImage: null,
          imageCount: 0,
        }).id,
    );
    expect(mapIds).toEqual(ids(sorted));
  });

  it("keeps the same order when switching the display currency", () => {
    const usd = ids(pipeline({ sort: "price_per_sqm_asc" }).sorted);
    const gel = ids(pipeline({ sort: "price_per_sqm_asc", display: "GEL" }).sorted);
    expect(gel).toEqual(usd);
  });
});
