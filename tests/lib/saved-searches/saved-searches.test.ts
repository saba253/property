import { describe, expect, it, vi } from "vitest";
import { getDistrictsPresentIn } from "@/lib/properties/cities";
import { getActiveDemoListingsWithProperties } from "@/lib/properties/get-demo-listing";
import { parseListingFilters } from "@/lib/properties/listing-filters";
import { parseSort } from "@/lib/properties/listing-sort";
import {
  MAX_SAVED_SEARCHES,
  SAVED_SEARCHES_STORAGE_KEY,
  type SavedSearch,
  addSavedSearch,
  canonicalSearchQuery,
  createSearchId,
  describeSearch,
  isSaveableSearch,
  normalizeSearchName,
  parseSavedSearchQuery,
  parseStoredSavedSearches,
  queryToRawQuery,
  removeSavedSearch,
  renameSavedSearch,
  sameSavedSearches,
  sanitizeSearchQuery,
  serializeSavedSearches,
} from "@/lib/saved-searches/saved-searches";
import { createPersistentStore } from "@/lib/storage/persistent-store";

const knownDistricts = getDistrictsPresentIn(
  getActiveDemoListingsWithProperties().map((item) => item.property),
);

/** The same steps as /properties: validate the URL, then build the canonical saved query. */
function queryFor(raw: Record<string, string | string[]>) {
  const parsed = parseListingFilters(raw, { knownDistricts });
  const { sort } = parseSort(raw);
  return {
    query: canonicalSearchQuery(parsed.filters, parsed.display, sort),
    parsed,
    sort,
  };
}

const entry = (id: string, query: string, name = "ძიება"): SavedSearch => ({ id, name, query });

describe("canonical saved query", () => {
  it("keeps validated criteria, currency and sort, but not the view", () => {
    const { query } = queryFor({
      view: "map",
      transaction: "rent",
      city: "tbilisi",
      district: "ვაკე",
      maxPrice: "1500",
      amenity: ["furniture", "balcony"],
      display: "GEL",
      sort: "price_asc",
    });
    const params = new URLSearchParams(query);
    expect(params.get("view")).toBeNull();
    expect(params.get("display")).toBe("GEL");
    expect(params.get("sort")).toBe("price_asc");
    expect(params.get("transaction")).toBe("rent");
    expect(params.get("district")).toBe("ვაკე");
    // Amenities in a stable order, so equal searches give equal queries.
    expect(params.getAll("amenity")).toEqual(["balcony", "furniture"]);
  });

  it("gives the same query for the same criteria in a different parameter order", () => {
    const a = queryFor({ city: "batumi", type: "apartment", rooms: "2" }).query;
    const b = queryFor({ rooms: "2", type: "apartment", city: "batumi" }).query;
    expect(a).toBe(b);
  });

  it("drops invalid and contradictory values instead of saving them as valid", () => {
    const { query, parsed } = queryFor({ city: "batumi", district: "ვაკე", rooms: "99" });
    expect(query).toBe("city=batumi");
    expect(parsed.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["district-not-in-city", "invalid-number"]),
    );
  });

  it("encodes Georgian values safely and reads them back", () => {
    const { query } = queryFor({ city: "tbilisi", district: "ვაკე" });
    expect(query).toContain("district=%E1%83%95");
    expect(queryToRawQuery(query)).toEqual({ city: "tbilisi", district: "ვაკე" });
  });

  it("does not offer to save the default search", () => {
    expect(isSaveableSearch(queryFor({}).parsed.filters)).toBe(false);
    expect(isSaveableSearch(queryFor({ display: "GEL", sort: "area_asc" }).parsed.filters)).toBe(
      false,
    );
    expect(isSaveableSearch(queryFor({ transaction: "rent" }).parsed.filters)).toBe(true);
    expect(isSaveableSearch(queryFor({ city: "tbilisi" }).parsed.filters)).toBe(true);
  });
});

describe("names and descriptions", () => {
  it("builds a name only from the chosen criteria", () => {
    const { parsed, sort } = queryFor({
      type: "apartment",
      city: "tbilisi",
      rooms: "2",
      maxPrice: "120000",
    });
    expect(describeSearch(parsed.filters, parsed.display, sort).suggestedName).toBe(
      "იყიდება · ბინა · თბილისი · 2 ოთახი · $120,000-მდე",
    );
    const rent = queryFor({
      transaction: "rent",
      city: "tbilisi",
      district: "ვაკე",
      maxPrice: "1500",
    });
    expect(describeSearch(rent.parsed.filters, rent.parsed.display, rent.sort).suggestedName).toBe(
      "ქირავდება · თბილისი, ვაკე · $1,500-მდე / თვე",
    );
  });

  it("lists every criterion, including currency and sort", () => {
    const { parsed, sort } = queryFor({ city: "batumi", display: "GEL", sort: "area_desc" });
    expect(describeSearch(parsed.filters, parsed.display, sort).criteria).toEqual([
      "იყიდება",
      "ქალაქი: ბათუმი",
      "ჩვენების ვალუტა: GEL",
      "დალაგება: ფართი: დიდიდან პატარისკენ",
    ]);
  });

  it("normalizes names and limits their length", () => {
    expect(normalizeSearchName("  ორი   ოთახი  ")).toBe("ორი ოთახი");
    expect(normalizeSearchName("   ")).toBe("");
    expect(normalizeSearchName("ა".repeat(100))).toHaveLength(60);
  });
});

describe("saved search list", () => {
  it("adds, detects duplicates, renames and deletes", () => {
    let list: SavedSearch[] = [];
    let result = addSavedSearch(list, entry("s-aaaa1", "city=tbilisi", "თბილისი"));
    expect(result.outcome).toBe("added");
    list = result.searches;
    result = addSavedSearch(list, entry("s-aaaa2", "city=tbilisi", "სხვა სახელი"));
    expect(result.outcome).toBe("duplicate");
    expect(result.existing?.name).toBe("თბილისი");
    expect(result.searches).toEqual(list);
    list = renameSavedSearch(list, "s-aaaa1", "  ჩემი ძიება ");
    expect(list[0].name).toBe("ჩემი ძიება");
    expect(renameSavedSearch(list, "s-aaaa1", "   ")[0].name).toBe("ჩემი ძიება");
    expect(removeSavedSearch(list, "s-aaaa1")).toEqual([]);
  });

  it("refuses empty names, empty queries and invalid ids", () => {
    expect(addSavedSearch([], entry("s-aaaa1", "city=tbilisi", " ")).outcome).toBe("invalid");
    expect(addSavedSearch([], entry("s-aaaa1", "")).outcome).toBe("invalid");
    expect(addSavedSearch([], entry("bad id", "city=tbilisi")).outcome).toBe("invalid");
  });

  it("keeps at most MAX_SAVED_SEARCHES", () => {
    let list: SavedSearch[] = [];
    for (let index = 0; index < MAX_SAVED_SEARCHES; index++) {
      list = addSavedSearch(list, entry(`s-id${index}x`, `minArea=${index + 1}`)).searches;
    }
    expect(list).toHaveLength(MAX_SAVED_SEARCHES);
    expect(addSavedSearch(list, entry("s-extra1", "minArea=999")).outcome).toBe("full");
  });

  it("creates valid ids", () => {
    const id = createSearchId(1_760_000_000_000, 0.123456);
    expect(addSavedSearch([], entry(id, "city=tbilisi")).outcome).toBe("added");
  });
});

describe("stored saved searches", () => {
  it("round-trips through the versioned format", () => {
    const list = [entry("s-aaaa1", "city=tbilisi&sort=price_asc", "თბილისი")];
    expect(parseStoredSavedSearches(serializeSavedSearches(list))).toEqual(list);
    expect(SAVED_SEARCHES_STORAGE_KEY).toBe("property-intelligence:saved-searches:v1");
  });

  it("drops malformed, obsolete and duplicate entries", () => {
    expect(parseStoredSavedSearches("{broken")).toEqual([]);
    expect(parseStoredSavedSearches('{"version":2,"searches":[]}')).toEqual([]);
    const stored = JSON.stringify({
      version: 1,
      searches: [
        { id: "s-aaaa1", name: "კარგი", query: "city=tbilisi&view=map&legacy=1" },
        { id: "s-aaaa2", name: "დუბლიკატი", query: "city=tbilisi" },
        { id: "s-aaaa3", name: "", query: "city=batumi" },
        { id: "nope", name: "ცუდი id", query: "city=batumi" },
        { id: "s-aaaa4", name: "მხოლოდ ზედმეტი", query: "view=map&foo=bar" },
        "not an object",
      ],
    });
    // Unsupported parameters (view, legacy, foo) are removed; empty results are dropped.
    expect(parseStoredSavedSearches(stored)).toEqual([entry("s-aaaa1", "city=tbilisi", "კარგი")]);
  });

  it("sanitizes queries to supported parameters", () => {
    expect(sanitizeSearchQuery("?view=map&city=tbilisi&tracking=x&amenity=balcony")).toBe(
      "city=tbilisi&amenity=balcony",
    );
    expect(sanitizeSearchQuery(`minArea=${"9".repeat(700)}`)).toBe("");
  });

  it("persists with the shared store, survives storage failures and other tabs' changes", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    };
    const options = {
      key: SAVED_SEARCHES_STORAGE_KEY,
      empty: [] as readonly SavedSearch[],
      parse: parseStoredSavedSearches,
      serialize: serializeSavedSearches,
      equals: sameSavedSearches,
    };
    const store = createPersistentStore(options, () => storage);
    const listener = vi.fn();
    store.subscribe(listener);
    store.update((list) => addSavedSearch(list, entry("s-aaaa1", "city=tbilisi")).searches);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(createPersistentStore(options, () => storage).getSnapshot().value).toHaveLength(1);
    store.handleStorageChange(SAVED_SEARCHES_STORAGE_KEY, serializeSavedSearches([]));
    expect(store.getSnapshot().value).toEqual([]);
    const blocked = createPersistentStore(options, () => null);
    expect(blocked.getSnapshot().status).toBe("memory-only");
  });

  it("never stores search results", () => {
    const raw = serializeSavedSearches([entry("s-aaaa1", "city=tbilisi")]);
    expect(raw).not.toContain("demo-listing");
    expect(Object.keys(JSON.parse(raw).searches[0]).sort()).toEqual(["id", "name", "query"]);
  });
});

describe("reopening a saved search", () => {
  it("goes through the normal validation and keeps currency, sort and the sale/rent budget", () => {
    const { query } = queryFor({
      transaction: "rent",
      maxPrice: "4000",
      display: "GEL",
      sort: "price_desc",
    });
    const reopened = parseSavedSearchQuery(query, { knownDistricts });
    expect(reopened.href).toBe(
      "/properties?display=GEL&sort=price_desc&transaction=rent&maxPrice=4000",
    );
    expect(reopened.hasIgnoredParts).toBe(false);
    expect(reopened.criteria).toContain("ქირა: ₾4,000-მდე / თვე");
  });

  it("reports parameters that are no longer valid and leaves them out", () => {
    const reopened = parseSavedSearchQuery("city=tbilisi&district=გამოგონილი&sort=newest", {
      knownDistricts,
    });
    expect(reopened.hasIgnoredParts).toBe(true);
    expect(reopened.href).toBe("/properties?city=tbilisi");
  });
});
