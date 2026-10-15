import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ExchangeRateState } from "@/lib/currency/exchange-rate";
import { createPostgresRepository } from "@/lib/db/postgres-repository";
import { seedDemoData } from "@/lib/db/seed-demo";
import { AMENITIES } from "@/lib/properties/amenities";
import { parseListingFilters } from "@/lib/properties/listing-filters";
import { SORT_OPTIONS } from "@/lib/properties/listing-sort";
import type { AmenityStatus, Listing, Property } from "@/lib/properties/types";
import type { ListingRepository } from "@/lib/repository/listing-repository";
import { type MemoryDataset, createMemoryRepository } from "@/lib/repository/memory-repository";
import { type TestDatabase, createTestDatabase } from "./test-database";

/*
 * Parity on a larger SYNTHETIC dataset (generated here, deterministic, never stored anywhere):
 * many ties (equal areas and prices), USD/GEL mixes, conversion values on .5 boundaries, unknown
 * facts and characteristics, inactive listings, several listings of one property. Not market data.
 */

function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An empty record and a missing one both mean "all unknown"; the database stores neither. */
const nonEmpty = <T extends object>(record: T) =>
  Object.keys(record).length > 0 ? record : undefined;

function syntheticDataset(count: number): MemoryDataset {
  const next = random(20261014);
  const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)];
  const statuses: AmenityStatus[] = ["yes", "no", "unknown"];
  const properties: Property[] = [];
  const listings: Listing[] = [];
  for (let i = 0; i < count; i++) {
    const type = next() < 0.75 ? "apartment" : "house";
    const city = pick(["თბილისი", "ბათუმი"]);
    const rooms = next() < 0.1 ? undefined : 1 + Math.floor(next() * 6);
    const features = Object.fromEntries(
      AMENITIES.filter((a) => a.group === "property" && !a.derived && next() < 0.6)
        .filter((a) => !a.appliesTo || a.appliesTo.includes(type))
        .map((a) => [a.key, pick(statuses)]),
    );
    const totalFloors = 2 + Math.floor(next() * 15);
    const base = {
      id: `synthetic-property-${i}`,
      city,
      district: pick(["უბანი-ა", "უბანი-ბ", "უბანი-გ"]),
      areaSqm: pick([40, 48.5, 55, 60, 60, 72.25, 80, 100, 120]),
      rooms,
      bedrooms: rooms === undefined || next() < 0.2 ? undefined : Math.floor(next() * rooms),
      bathrooms: next() < 0.2 ? undefined : Math.floor(next() * 3),
      location: { precision: "unknown" as const },
      features: nonEmpty(features),
      dataSource: "demo" as const,
    };
    properties.push(
      type === "apartment"
        ? {
            ...base,
            type,
            totalFloors,
            floor:
              next() < 0.15 ? undefined : pick([totalFloors, Math.floor(next() * totalFloors)]),
          }
        : { ...base, type, storeys: 1 + Math.floor(next() * 3) },
    );
    // Some properties have a second listing (relisted) to cover duplicates.
    for (const copy of next() < 0.1 ? [0, 1] : [0]) {
      const rent = next() < 0.35;
      const currency = pick(["USD", "GEL"] as const);
      // Rents and prices from a small set, so equal values (ties) are common; 1001.25 GEL with a
      // rate of 2.5 converts to exactly 400.5 USD (a rounding boundary).
      const amount = rent
        ? pick([400, 500, 1001.25, 1200, 1500, 2500])
        : pick([50000, 75000, 100000, 100000, 150000.5, 250000]);
      const common = {
        id: `synthetic-listing-${i}-${copy}`,
        propertyId: base.id,
        title: `სინთეზური ${i}`,
        askingPrice: { amount, currency },
        status: next() < 0.08 ? ("inactive" as const) : ("active" as const),
        equipment: nonEmpty(
          Object.fromEntries(
            AMENITIES.filter((a) => a.group === "listing" && next() < 0.5).map((a) => [
              a.key,
              pick(statuses),
            ]),
          ),
        ),
        dataSource: "demo" as const,
      };
      listings.push(
        rent
          ? { ...common, transactionType: "rent", rentPeriod: "month" }
          : { ...common, transactionType: "sale" },
      );
    }
  }
  return { properties, listings, images: [] };
}

const dataset = syntheticDataset(400);
let db: TestDatabase;
let sql: ListingRepository;
const memory = createMemoryRepository(dataset);

beforeAll(async () => {
  db = await createTestDatabase();
  await seedDemoData(db, dataset);
  sql = createPostgresRepository(db);
}, 120_000);
afterAll(() => db.close());

const rates: ExchangeRateState[] = [
  {
    status: "available",
    freshness: "current",
    rate: { source: "nbg", gelPerUsd: 2.5, effectiveDate: "2026-10-14", publishedAt: null },
  },
  {
    status: "available",
    freshness: "current",
    rate: { source: "nbg", gelPerUsd: 2.7183, effectiveDate: "2026-10-14", publishedAt: null },
  },
  { status: "unavailable" },
];

const QUERIES: Record<string, string | string[]>[] = [
  {},
  { transaction: "rent" },
  { maxPrice: "401", transaction: "rent" },
  { minPrice: "400", maxPrice: "401", transaction: "rent" },
  { minPrice: "1001", maxPrice: "1002", display: "GEL", transaction: "rent" },
  { minPrice: "100000", maxPrice: "150000" },
  { maxPrice: "300000", display: "GEL", type: "apartment" },
  { city: "batumi", district: "უბანი-ბ", minArea: "60" },
  { rooms: "5", amenity: ["balcony"] },
  { amenity: ["topFloor", "elevator"], minFloor: "3" },
  { amenity: ["furniture", "dishwasher"], currency: "GEL" },
  { minBedrooms: "1", minBathrooms: "1", maxArea: "80" },
];

describe("synthetic dataset parity", () => {
  it("has the intended variety", () => {
    expect(dataset.listings.length).toBeGreaterThan(420);
    expect(dataset.listings.some((l) => l.status === "inactive")).toBe(true);
  });

  it("matches memory exactly for filters, sorts, rates and pages", async () => {
    for (const rateState of rates) {
      for (const raw of QUERIES) {
        const { filters, display } = parseListingFilters(raw);
        for (const { value: sort } of SORT_OPTIONS) {
          const query = { filters, display, rateState, sort, page: { offset: 7, limit: 25 } };
          const [a, b] = await Promise.all([
            memory.searchListings(query),
            sql.searchListings(query),
          ]);
          const ids = (r: typeof a) => r.items.map((item) => item.listing.id);
          expect(ids(b), JSON.stringify({ raw, sort, rate: rateState.status })).toEqual(ids(a));
          expect(b.items).toEqual(a.items);
          expect([b.total, b.notComparableCount, b.sortApplied, b.sortNotice]).toEqual([
            a.total,
            a.notComparableCount,
            a.sortApplied,
            a.sortNotice,
          ]);
        }
      }
    }
  }, 120_000);
});
