import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { selectComparables } from "@/lib/analytics/comparables";
import type { ExchangeRateState } from "@/lib/currency/exchange-rate";
import { createPostgresRepository } from "@/lib/db/postgres-repository";
import { seedDemoData } from "@/lib/db/seed-demo";
import { getDistrictsPresentIn } from "@/lib/properties/cities";
import { demoListings } from "@/lib/properties/demo-data";
import { parseListingFilters } from "@/lib/properties/listing-filters";
import { SORT_OPTIONS } from "@/lib/properties/listing-sort";
import type { ListingRepository, ListingSearchQuery } from "@/lib/repository/listing-repository";
import { createMemoryRepository } from "@/lib/repository/memory-repository";
import { type TestDatabase, createTestDatabase } from "./test-database";

/*
 * The PostgreSQL repository (on PGlite: real PostgreSQL SQL, in WebAssembly) must return exactly
 * what the memory repository returns for the seeded demo data: same listings, same order, same
 * counts, same notices. This guards against the two implementations drifting apart.
 */

let db: TestDatabase;
let sql: ListingRepository;
const memory = createMemoryRepository();

beforeAll(async () => {
  db = await createTestDatabase();
  await seedDemoData(db);
  sql = createPostgresRepository(db);
});
afterAll(() => db.close());

const rate: ExchangeRateState = {
  status: "available",
  freshness: "current",
  rate: { source: "nbg", gelPerUsd: 2.5989, effectiveDate: "2026-10-14", publishedAt: null },
};
const noRate: ExchangeRateState = { status: "unavailable" };

const QUERIES: Record<string, string | string[]>[] = [
  {},
  { transaction: "rent" },
  { type: "apartment" },
  { type: "house" },
  { city: "tbilisi" },
  { city: "batumi", type: "apartment" },
  { city: "tbilisi", district: "ვაკე" },
  { transaction: "rent", district: "ვაკე" },
  { maxPrice: "150000" },
  { minPrice: "100000", maxPrice: "200000" },
  { minPrice: "60000", display: "GEL" },
  { maxPrice: "400000", display: "GEL" },
  { transaction: "rent", maxPrice: "1500" },
  { transaction: "rent", minPrice: "1000", display: "GEL" },
  { currency: "GEL" },
  { currency: "USD", type: "apartment" },
  { minArea: "50", maxArea: "100" },
  { minArea: "48.5", maxArea: "65" },
  { rooms: "2" },
  { rooms: "5" },
  { minBedrooms: "2" },
  { minBathrooms: "2" },
  { minFloor: "3", maxFloor: "10" },
  { maxFloor: "2" },
  { amenity: "balcony" },
  { amenity: ["balcony", "elevator"] },
  { amenity: "topFloor" },
  { amenity: "furniture", transaction: "rent" },
  { amenity: ["parking", "naturalGas"], type: "house" },
  { amenity: "dishwasher" },
  { city: "tbilisi", maxPrice: "300000", minArea: "60", amenity: "centralHeating" },
];

const DISTRICTS = getDistrictsPresentIn(
  (await memory.getActiveListings()).map((item) => item.property),
);

function toQuery(raw: Record<string, string | string[]>, rateState: ExchangeRateState) {
  const { filters, display } = parseListingFilters(raw, { knownDistricts: DISTRICTS });
  return { filters, display, rateState };
}

const ids = (items: { listing: { id: string } }[]) => items.map((item) => item.listing.id);

async function compare(query: ListingSearchQuery) {
  const [a, b] = await Promise.all([memory.searchListings(query), sql.searchListings(query)]);
  expect(ids(b.items)).toEqual(ids(a.items));
  expect(b.items).toEqual(a.items);
  expect({ ...b, items: [] }).toEqual({ ...a, items: [] });
  return a;
}

describe("search parity (memory vs PostgreSQL)", () => {
  for (const rateState of [rate, noRate]) {
    const label = rateState.status === "available" ? "with a rate" : "without a rate";
    it(`gives identical results, counts and order for every filter and sort, ${label}`, async () => {
      let nonEmpty = 0;
      for (const raw of QUERIES) {
        for (const { value: sort } of SORT_OPTIONS) {
          const result = await compare({ ...toQuery(raw, rateState), sort });
          if (result.total > 0) nonEmpty++;
        }
        const counts = await Promise.all([
          memory.countListings(toQuery(raw, rateState)),
          sql.countListings(toQuery(raw, rateState)),
        ]);
        expect(counts[1]).toEqual(counts[0]);
      }
      // The matrix really exercises results, not only empty lists.
      expect(nonEmpty).toBeGreaterThan(100);
    });
  }

  it("reports budget listings that cannot be compared without a rate", async () => {
    const result = await compare({ ...toQuery({ maxPrice: "200000" }, noRate), sort: "default" });
    expect(result.notComparableCount).toBeGreaterThan(0);
  });

  it("falls back to the default order with a notice for mixed currencies without a rate", async () => {
    const result = await compare({ ...toQuery({}, noRate), sort: "price_asc" });
    expect(result.sortApplied).toBe("default");
    expect(result.sortNotice).toBe("rate-unavailable");
  });

  it("pages deterministically: pages joined equal the full list", async () => {
    for (const repository of [memory, sql]) {
      const base = { ...toQuery({}, rate), sort: "price_per_sqm_desc" as const };
      const full = await repository.searchListings(base);
      const pages = [];
      for (let offset = 0; offset < full.total; offset += 3) {
        const page = await repository.searchListings({ ...base, page: { offset, limit: 3 } });
        expect(page.page).toEqual({ offset, limit: 3 });
        expect(page.total).toBe(full.total);
        pages.push(...ids(page.items));
      }
      expect(pages).toEqual(ids(full.items));
    }
  });
});

describe("read parity", () => {
  it("returns the same listings, ids, facets, images and covers", async () => {
    expect(await sql.getListingIds()).toEqual(await memory.getListingIds());
    expect(await sql.getActiveListings()).toEqual(await memory.getActiveListings());
    expect(await sql.getSearchFacets()).toEqual(await memory.getSearchFacets());
    const allIds = demoListings.map((listing) => listing.id);
    for (const id of allIds) {
      expect(await sql.getListingById(id)).toEqual(await memory.getListingById(id));
      expect(await sql.getListingImages(id)).toEqual(await memory.getListingImages(id));
    }
    expect(await sql.getListingCovers(allIds)).toEqual(await memory.getListingCovers(allIds));
  });

  it("returns null for missing ids in both", async () => {
    expect(await sql.getListingById("demo-listing-999")).toBeNull();
    expect(await memory.getListingById("demo-listing-999")).toBeNull();
    expect(await sql.getListingById("' OR 1=1 --")).toBeNull();
  });

  it("pre-selects comparables in SQL without changing the final selection", async () => {
    for (const subject of await memory.getActiveListings()) {
      const fromSql = await sql.findComparableCandidates(subject);
      const fromMemory = await memory.findComparableCandidates(subject);
      expect(fromSql.length).toBeLessThanOrEqual(fromMemory.length);
      expect(selectComparables(subject, fromSql)).toEqual(selectComparables(subject, fromMemory));
    }
  });
});
