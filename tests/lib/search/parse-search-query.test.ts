import { describe, expect, it } from "vitest";
import { getCitiesPresentIn, getDistrictsPresentIn } from "@/lib/properties/cities";
import { buildListingsHref } from "@/lib/properties/filter-chips";
import { getActiveDemoListingsWithProperties } from "@/lib/properties/get-demo-listing";
import { filterListings, parseListingFilters } from "@/lib/properties/listing-filters";
import { type SearchContext, parseSearchQuery } from "@/lib/search/parse-search-query";

// Context built from the demo data, exactly as the listings page builds it.
const items = getActiveDemoListingsWithProperties();
const context: SearchContext = {
  cities: getCitiesPresentIn(items.map((item) => item.property.city)),
  districts: getDistrictsPresentIn(items.map((item) => item.property)),
  defaultCurrency: "USD",
};

const parse = (text: string) => parseSearchQuery(text, context);

describe("parseSearchQuery: places", () => {
  it("recognizes cities, including inflected forms", () => {
    expect(parse("თბილისი").params).toEqual({ city: "tbilisi" });
    expect(parse("თბილისში").params).toEqual({ city: "tbilisi" });
    expect(parse("ბათუმი").params).toEqual({ city: "batumi" });
  });

  it("recognizes districts from the data and adds their city", () => {
    expect(parse("ვაკე").params).toEqual({ district: "ვაკე", city: "tbilisi" });
    expect(parse("ვაკეში").params).toEqual({ district: "ვაკე", city: "tbilisi" });
    expect(parse("საბურთალოზე").params).toEqual({ district: "საბურთალო", city: "tbilisi" });
  });

  it("prefers a multi-word district over its city name", () => {
    expect(parse("ძველი ბათუმი").params).toEqual({ district: "ძველი ბათუმი", city: "batumi" });
    expect(parse("ძველ ბათუმში").params).toEqual({ district: "ძველი ბათუმი", city: "batumi" });
  });

  it("does not apply conflicting places", () => {
    const result = parse("თბილისი ბათუმი");
    expect(result.params.city).toBeUndefined();
    expect(result.notes).toContainEqual({ code: "conflict", kind: "city" });

    const mismatch = parse("ვაკე ბათუმი");
    expect(mismatch.params.district).toBeUndefined();
    expect(mismatch.notes).toContainEqual({ code: "conflict", kind: "district" });
  });
});

describe("parseSearchQuery: rooms", () => {
  it("recognizes numeric and written room counts", () => {
    expect(parse("2 ოთახი").params).toEqual({ rooms: "2" });
    expect(parse("ორი ოთახი").params).toEqual({ rooms: "2" });
    expect(parse("სამი ოთახით").params).toEqual({ rooms: "3" });
    expect(parse("ოროთახიანი").params).toEqual({ rooms: "2" });
    expect(parse("3-ოთახიანი").params).toEqual({ rooms: "3" });
  });

  it("caps large room counts at 5+ with a note", () => {
    const result = parse("7 ოთახი");
    expect(result.params.rooms).toBe("5");
    expect(result.notes).toContainEqual({ code: "rooms-capped" });
  });

  it("does not apply two different room counts", () => {
    const result = parse("2 ოთახი 3 ოთახი");
    expect(result.params.rooms).toBeUndefined();
    expect(result.notes).toContainEqual({ code: "conflict", kind: "rooms" });
  });
});

describe("parseSearchQuery: budget", () => {
  it("reads a maximum budget with an explicit currency word", () => {
    expect(parse("100000 დოლარამდე").params).toEqual({ display: "USD", maxPrice: "100000" });
    expect(parse("300000 ლარამდე").params).toEqual({ display: "GEL", maxPrice: "300000" });
  });

  it("reads symbols, separators, thousands and -მდე / -დან", () => {
    expect(parse("$100000-მდე").params).toEqual({ display: "USD", maxPrice: "100000" });
    expect(parse("100 000$-მდე").params).toEqual({ display: "USD", maxPrice: "100000" });
    expect(parse("100,000 დოლარამდე").params.maxPrice).toBe("100000");
    expect(parse("150 ათას დოლარამდე").params.maxPrice).toBe("150000");
    expect(parse("50000-დან 120000 დოლარამდე").params).toEqual({
      display: "USD",
      minPrice: "50000",
      maxPrice: "120000",
    });
  });

  it("assumes the display currency when none is given, and says so", () => {
    const result = parse("100000-მდე");
    expect(result.params).toEqual({ display: "USD", maxPrice: "100000" });
    expect(result.notes).toContainEqual({ code: "currency-assumed", currency: "USD" });
  });

  it("does not guess the meaning of a bare number", () => {
    const result = parse("თბილისი 100000");
    expect(result.params).toEqual({ city: "tbilisi" });
    expect(result.notes).toContainEqual({ code: "number-without-meaning", text: "100000" });
  });

  it("does not apply budgets in two different currencies", () => {
    const result = parse("100000 დოლარამდე 50000 ლარიდან");
    expect(result.params.maxPrice).toBeUndefined();
    expect(result.notes).toContainEqual({ code: "conflict", kind: "budget" });
  });
});

describe("parseSearchQuery: property type and sale/rent", () => {
  it("recognizes property types", () => {
    expect(parse("ბინა").params).toEqual({ type: "apartment" });
    expect(parse("კერძო სახლი თბილისში").params).toEqual({ type: "house", city: "tbilisi" });
  });

  it("recognizes rent and sale intent", () => {
    expect(parse("ბათუმი ბინა ქირით").params).toEqual({
      city: "batumi",
      type: "apartment",
      transaction: "rent",
    });
    expect(parse("იყიდება სახლი").params).toEqual({ type: "house", transaction: "sale" });
  });

  it("does not apply contradictory intent", () => {
    const result = parse("ქირით იყიდება");
    expect(result.params.transaction).toBeUndefined();
    expect(result.notes).toContainEqual({ code: "conflict", kind: "transaction" });
  });
});

describe("parseSearchQuery: combined and unsupported input", () => {
  it("parses a full phrase", () => {
    const result = parse("თბილისი 2 ოთახი 100000 დოლარამდე");
    expect(result.params).toEqual({
      city: "tbilisi",
      rooms: "2",
      display: "USD",
      maxPrice: "100000",
    });
    expect(result.recognized.map((term) => term.label)).toEqual([
      "ქალაქი: თბილისი",
      "2 ოთახი",
      "ბიუჯეტი: $100,000-მდე",
    ]);
    expect(result.unrecognized).toEqual([]);
  });

  it("reports unknown words instead of applying them", () => {
    const result = parse("თბილისი აუზით ზღვის ხედით");
    expect(result.params).toEqual({ city: "tbilisi" });
    expect(result.unrecognized).toEqual(["აუზით", "ზღვის", "ხედით"]);
  });

  it("returns nothing for text it does not understand", () => {
    const result = parse("ლამაზი ადგილი");
    expect(result.params).toEqual({});
    expect(result.recognized).toEqual([]);
    expect(result.unrecognized).toEqual(["ლამაზი", "ადგილი"]);
  });

  it("ignores filler words and handles empty input", () => {
    expect(parse("მინდა ბინა ვაკეში").unrecognized).toEqual([]);
    expect(parse("   ")).toEqual({ params: {}, recognized: [], unrecognized: [], notes: [] });
  });

  it("does not recognize places that are not in the data", () => {
    const result = parse("ქუთაისი");
    expect(result.params).toEqual({});
    expect(result.unrecognized).toEqual(["ქუთაისი"]);
  });
});

describe("search parameters work with the existing filters", () => {
  const knownDistricts = context.districts.map((district) => district.name);
  const rate = {
    status: "available" as const,
    freshness: "current" as const,
    rate: {
      source: "nbg" as const,
      gelPerUsd: 2.6,
      effectiveDate: "2026-10-10",
      publishedAt: null,
    },
  };

  function results(text: string) {
    const { filters, display, issues } = parseListingFilters(parse(text).params, {
      knownDistricts,
    });
    expect(issues).toEqual([]);
    return filterListings(items, filters, display, rate).matches.map((item) => item.listing.id);
  }

  it("validates every generated parameter without issues and finds the expected listings", () => {
    expect(results("ვაკე")).toEqual(["demo-listing-1"]);
    expect(results("თბილისი 2 ოთახი")).toEqual(["demo-listing-4"]);
    expect(results("კერძო სახლი თბილისში")).toEqual(["demo-listing-7"]);
    expect(results("ბათუმი ბინა ქირით")).toEqual(["demo-listing-10"]);
    expect(results("100000 დოლარამდე")).toEqual([
      "demo-listing-2",
      "demo-listing-4",
      "demo-listing-5",
    ]);
  });

  it("produces canonical URLs through the existing URL builder", () => {
    const { filters, display } = parseListingFilters(parse("ბათუმი ბინა ქირით").params);
    expect(buildListingsHref(filters, display)).toBe(
      "/properties?transaction=rent&type=apartment&city=batumi",
    );
  });
});
