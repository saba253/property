import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ExchangeRateState } from "@/lib/currency/exchange-rate";
import { createPostgresRepository } from "@/lib/db/postgres-repository";
import { seedDemoData } from "@/lib/db/seed-demo";
import { demoListingImages } from "@/lib/properties/demo-images";
import { SORT_OPTIONS } from "@/lib/properties/listing-sort";
import type { Listing, Property } from "@/lib/properties/types";
import {
  COUNT_LIMIT,
  type ListingRepository,
  MAX_BATCH_IDS,
} from "@/lib/repository/listing-repository";
import {
  DEMO_DATASET,
  type MemoryDataset,
  createMemoryRepository,
} from "@/lib/repository/memory-repository";
import { type TestDatabase, createTestDatabase } from "./test-database";

/*
 * Batch lookups and pagination in both backends (PGlite = real PostgreSQL SQL in WebAssembly).
 * The large dataset is SYNTHETIC, generated here, never stored and never shown in the app.
 */

const rate: ExchangeRateState = {
  status: "available",
  freshness: "current",
  rate: { source: "nbg", gelPerUsd: 2.5, effectiveDate: "2026-10-15", publishedAt: null },
};
const noRate: ExchangeRateState = { status: "unavailable" };

/** Demo data plus one ended (inactive) listing, to check the public policy. */
const withEnded: MemoryDataset = {
  ...DEMO_DATASET,
  listings: [
    ...DEMO_DATASET.listings,
    { ...DEMO_DATASET.listings[0], id: "demo-listing-ended", status: "inactive" },
  ],
};

/** 1,400 synthetic sale/rent listings (1,120 for sale) with many equal prices and areas (ties across pages). */
function largeDataset(): MemoryDataset {
  const properties: Property[] = [];
  const listings: Listing[] = [];
  for (let i = 0; i < 1400; i++) {
    const id = `synthetic-p-${i}`;
    properties.push({
      id,
      type: i % 4 === 0 ? "house" : "apartment",
      city: i % 3 === 0 ? "ბათუმი" : "თბილისი",
      district: `უბანი-${i % 5}`,
      areaSqm: 40 + (i % 7) * 10,
      location: { precision: "unknown" },
      dataSource: "demo",
    });
    const rent = i % 5 === 0;
    const common = {
      id: `synthetic-l-${String(i).padStart(4, "0")}`,
      propertyId: id,
      title: `სინთეზური ${i}`,
      askingPrice: {
        amount: rent ? 500 + (i % 6) * 100 : 50000 + (i % 9) * 10000,
        currency: i % 2 === 0 ? ("USD" as const) : ("GEL" as const),
      },
      status: "active" as const,
      dataSource: "demo" as const,
    };
    listings.push(
      rent
        ? { ...common, transactionType: "rent", rentPeriod: "month" }
        : { ...common, transactionType: "sale" },
    );
  }
  return { properties, listings, images: [] };
}

let demoDb: TestDatabase;
let largeDb: TestDatabase;
let demoSql: ListingRepository;
let largeSql: ListingRepository;
const demoMemory = createMemoryRepository(withEnded);
const large = largeDataset();
const largeMemory = createMemoryRepository(large);

beforeAll(async () => {
  [demoDb, largeDb] = await Promise.all([createTestDatabase(), createTestDatabase()]);
  await Promise.all([seedDemoData(demoDb, withEnded), seedDemoData(largeDb, large)]);
  demoSql = createPostgresRepository(demoDb);
  largeSql = createPostgresRepository(largeDb);
}, 120_000);
afterAll(async () => {
  await Promise.all([demoDb.close(), largeDb.close()]);
});

const ids = (items: { listing: { id: string } }[]) => items.map((item) => item.listing.id);

describe("getListingsByIds", () => {
  it("returns requested public listings in order, once, in both backends", async () => {
    const request = ["demo-listing-9", "missing-1", "demo-listing-2", "demo-listing-9"];
    for (const repository of [demoMemory, demoSql]) {
      expect(ids(await repository.getListingsByIds(request))).toEqual([
        "demo-listing-9",
        "demo-listing-2",
      ]);
      expect(await repository.getListingsByIds([])).toEqual([]);
      // Inactive listings stay public by id; callers that need active ones filter by status.
      const [ended] = await repository.getListingsByIds(["demo-listing-ended"]);
      expect(ended.listing.status).toBe("inactive");
    }
    expect(await demoSql.getListingsByIds(request)).toEqual(
      await demoMemory.getListingsByIds(request),
    );
  });

  it("refuses more than MAX_BATCH_IDS distinct ids", async () => {
    const tooMany = Array.from({ length: MAX_BATCH_IDS + 1 }, (_, i) => `x-${i}`);
    for (const repository of [demoMemory, demoSql]) {
      await expect(repository.getListingsByIds(tooMany)).rejects.toThrow(RangeError);
      await expect(repository.getListingCovers(tooMany)).rejects.toThrow(RangeError);
    }
  });

  it("uses one query for listings and one batched query for covers", async () => {
    const texts: string[] = [];
    const counting = createPostgresRepository({
      query: (text, params) => {
        texts.push(text);
        return demoDb.query(text, params);
      },
      exec: (text) => demoDb.exec(text),
    });
    const wanted = ["demo-listing-1", "demo-listing-2", "demo-listing-3", "demo-listing-8"];
    await counting.getListingsByIds(wanted);
    const covers = await counting.getListingCovers(wanted);
    // 1 listing query + 2 characteristic queries + 1 image query, whatever the number of ids.
    expect(texts).toHaveLength(4);
    expect(covers["demo-listing-3"].coverImage?.id).toBe("demo-listing-3-image-2");
    expect(covers["demo-listing-8"]).toEqual({ coverImage: null, imageCount: 0 });
    expect(covers["demo-listing-1"].imageCount).toBe(
      demoListingImages.filter((image) => image.listingId === "demo-listing-1").length,
    );
  });
});

describe("pagination on a large synthetic dataset", () => {
  it("bounds the count above COUNT_LIMIT identically in both backends", async () => {
    const query = { filters: {}, display: "USD" as const, rateState: rate };
    const [a, b] = await Promise.all([
      largeMemory.countListings(query),
      largeSql.countListings(query),
    ]);
    expect(a).toEqual(b);
    expect(a).toEqual({ total: COUNT_LIMIT, totalIsExact: false, notComparableCount: 0 });
    const small = {
      filters: { transaction: "rent" as const },
      display: "USD" as const,
      rateState: rate,
    };
    expect(await largeSql.countListings(small)).toEqual(await largeMemory.countListings(small));
    expect((await largeSql.countListings(small)).totalIsExact).toBe(true);
  });

  it("walks pages of every sort without gaps or repeats, exactly like memory", async () => {
    for (const rateState of [rate, noRate]) {
      for (const transaction of ["sale", "rent"] as const) {
        for (const { value: sort } of SORT_OPTIONS) {
          const filters = transaction === "rent" ? { transaction } : {};
          const all = await largeMemory.searchListings({
            filters,
            display: "GEL",
            rateState,
            sort,
            page: { offset: 0, limit: 100 },
          });
          const seen: string[] = [];
          for (let offset = 0; offset < 230; offset += 23) {
            const query = {
              filters,
              display: "GEL" as const,
              rateState,
              sort,
              page: { offset, limit: 23 },
            };
            const [a, b] = await Promise.all([
              largeMemory.searchListings(query),
              largeSql.searchListings(query),
            ]);
            expect(ids(b.items)).toEqual(ids(a.items));
            expect([b.total, b.totalIsExact, b.hasNextPage, b.sortApplied, b.sortNotice]).toEqual([
              a.total,
              a.totalIsExact,
              a.hasNextPage,
              a.sortApplied,
              a.sortNotice,
            ]);
            seen.push(...ids(a.items));
          }
          expect(new Set(seen).size).toBe(seen.length);
          expect(seen.slice(0, 100)).toEqual(ids(all.items));
        }
      }
    }
  }, 120_000);

  it("reports the end of the results and pages past the end", async () => {
    const filters = { transaction: "rent" as const };
    const { total } = await largeMemory.countListings({ filters, display: "USD", rateState: rate });
    for (const repository of [largeMemory, largeSql]) {
      const last = await repository.searchListings({
        filters,
        display: "USD",
        rateState: rate,
        sort: "price_desc",
        page: { offset: total - 5, limit: 10 },
      });
      expect(last.items).toHaveLength(5);
      expect(last.hasNextPage).toBe(false);
      const beyond = await repository.searchListings({
        filters,
        display: "USD",
        rateState: rate,
        sort: "price_desc",
        page: { offset: total + 50, limit: 10 },
      });
      expect(beyond.items).toEqual([]);
      expect(beyond.total).toBe(total);
      expect(beyond.totalIsExact).toBe(true);
    }
  });
});
