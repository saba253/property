import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Listing, ListingImage, Property } from "@/lib/properties/types";
import {
  validateListingImages,
  validateListingRecord,
  validatePropertyRecord,
} from "@/lib/properties/validate-record";
import { seedDemoData } from "@/lib/db/seed-demo";
import { type TestDatabase, createTestDatabase } from "./test-database";

/*
 * Every rule is checked twice: the database rejects the row (PGlite, real PostgreSQL SQL) and the
 * TypeScript record validation reports it, so both layers agree. Synthetic records only.
 */

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(() => db.close());

const apartment: Property = {
  id: "test-property-a",
  type: "apartment",
  city: "თბილისი",
  district: "ტესტი",
  areaSqm: 60,
  rooms: 2,
  bedrooms: 1,
  floor: 3,
  totalFloors: 9,
  location: { precision: "unknown" },
  dataSource: "demo",
};

const sale: Listing = {
  id: "test-listing-a",
  propertyId: "test-property-a",
  title: "სატესტო",
  transactionType: "sale",
  askingPrice: { amount: 100000, currency: "USD" },
  status: "active",
  dataSource: "demo",
};

/** Inserts with a SAVEPOINT so a rejected row does not abort the other checks. */
async function rejects(sql: string, params: unknown[]): Promise<boolean> {
  await db.exec("BEGIN");
  try {
    await db.query(sql, params);
    return false;
  } catch {
    return true;
  } finally {
    await db.exec("ROLLBACK");
  }
}

const PROPERTY_SQL = `INSERT INTO properties (id, type, city_slug, district, area_sqm, rooms, bedrooms,
  bathrooms, floor, total_floors, storeys, land_area_sqm, location_precision, location_area_id,
  latitude, longitude, location_verified_on, data_source)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`;

type PropertyRow = {
  id: string;
  type: string;
  city: string;
  district: string;
  area: string;
  rooms: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  totalFloors: number | null;
  storeys: number | null;
  land: string | null;
  precision: string;
  areaId: string | null;
  lat: string | null;
  lng: string | null;
  verified: string | null;
  source: string;
};

const baseRow: PropertyRow = {
  id: "row-property",
  type: "apartment",
  city: "tbilisi",
  district: "ტესტი",
  area: "60",
  rooms: 2,
  bedrooms: 1,
  bathrooms: 1,
  floor: 3,
  totalFloors: 9,
  storeys: null,
  land: null,
  precision: "unknown",
  areaId: null,
  lat: null,
  lng: null,
  verified: null,
  source: "demo",
};

const insertProperty = (row: Partial<PropertyRow>) => {
  const r = { ...baseRow, ...row };
  return rejects(PROPERTY_SQL, [
    r.id,
    r.type,
    r.city,
    r.district,
    r.area,
    r.rooms,
    r.bedrooms,
    r.bathrooms,
    r.floor,
    r.totalFloors,
    r.storeys,
    r.land,
    r.precision,
    r.areaId,
    r.lat,
    r.lng,
    r.verified,
    r.source,
  ]);
};

describe("properties", () => {
  it("accepts a valid apartment and a valid house", async () => {
    expect(await insertProperty({})).toBe(false);
    expect(
      await insertProperty({
        type: "house",
        floor: null,
        totalFloors: null,
        storeys: 2,
        land: "400.5",
      }),
    ).toBe(false);
    expect(validatePropertyRecord(apartment)).toEqual([]);
  });

  it.each([
    ["zero area", { area: "0" }, { areaSqm: 0 }],
    ["negative area", { area: "-5" }, { areaSqm: -5 }],
    ["unknown city", { city: "kutaisi" }, { city: "ქუთაისი" }],
    ["blank district", { district: " " }, { district: " " }],
    ["floor above building", { floor: 10, totalFloors: 9 }, { floor: 10, totalFloors: 9 }],
    ["more bedrooms than rooms", { rooms: 1, bedrooms: 2 }, { rooms: 1, bedrooms: 2 }],
    ["fractional rooms", { rooms: 2.5 }, { rooms: 2.5 }],
    ["non-demo source", { source: "real" }, { dataSource: "local-draft" }],
  ] as const)("rejects %s in both layers", async (_name, row, record) => {
    expect(await insertProperty(row as Partial<PropertyRow>)).toBe(true);
    expect(validatePropertyRecord({ ...apartment, ...record } as Property)).not.toEqual([]);
  });

  it("keeps apartment and house facts apart", async () => {
    expect(await insertProperty({ storeys: 2 })).toBe(true);
    expect(await insertProperty({ type: "house", storeys: 2 })).toBe(true); // floor still set
    expect(validatePropertyRecord({ ...apartment, storeys: 2 } as unknown as Property)).not.toEqual(
      [],
    );
  });

  it("requires a consistent location", async () => {
    expect(await insertProperty({ precision: "approximate" })).toBe(true);
    expect(await insertProperty({ precision: "approximate", areaId: "tbilisi-vake" })).toBe(false);
    expect(await insertProperty({ precision: "exact", lat: "41.7", lng: "44.8" })).toBe(true);
    expect(
      await insertProperty({
        precision: "exact",
        lat: "41.7",
        lng: "44.8",
        verified: "2026-10-01",
      }),
    ).toBe(false);
    expect(await insertProperty({ precision: "unknown", lat: "41.7" })).toBe(true);
    expect(await insertProperty({ precision: "nearby" })).toBe(true);
  });
});

describe("listings", () => {
  beforeAll(async () => {
    await db.query(PROPERTY_SQL, [
      "base-property",
      "apartment",
      "tbilisi",
      "ტესტი",
      "60",
      2,
      1,
      1,
      3,
      9,
      null,
      null,
      "unknown",
      null,
      null,
      null,
      null,
      "demo",
    ]);
  });

  const LISTING_SQL = `INSERT INTO listings (id, property_id, title, transaction_type, rent_period,
    asking_amount, asking_currency, status, data_source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`;
  const insertListing = (overrides: unknown[]) => {
    const values: unknown[] = [
      "row-listing",
      "base-property",
      "სატესტო",
      "sale",
      null,
      "100000",
      "USD",
      "active",
      "demo",
    ];
    overrides.forEach((value, index) => {
      if (value !== undefined) values[index] = value;
    });
    return rejects(LISTING_SQL, values);
  };
  const u = undefined;

  it("accepts valid sale and monthly rent listings", async () => {
    expect(await insertListing([])).toBe(false);
    expect(await insertListing([u, u, u, "rent", "month", "1200"])).toBe(false);
    expect(validateListingRecord(sale)).toEqual([]);
  });

  it.each([
    ["zero price", [u, u, u, u, u, "0"], { askingPrice: { amount: 0, currency: "USD" } }],
    ["negative price", [u, u, u, u, u, "-1"], { askingPrice: { amount: -1, currency: "USD" } }],
    [
      "price with 3 decimals",
      [u, u, u, u, u, "100000.555"],
      { askingPrice: { amount: 100000.555, currency: "USD" } },
    ],
    [
      "unknown currency",
      [u, u, u, u, u, u, "EUR"],
      { askingPrice: { amount: 100000, currency: "EUR" } },
    ],
    [
      "rent without period",
      [u, u, u, "rent", null, "1200"],
      { transactionType: "rent", askingPrice: { amount: 1200, currency: "USD" } },
    ],
    [
      "sale price as rent",
      [u, u, u, "rent", "month", "500000"],
      {
        transactionType: "rent",
        rentPeriod: "month",
        askingPrice: { amount: 500000, currency: "USD" },
      },
    ],
    ["empty title", [u, u, " "], { title: " " }],
    ["non-demo source", [u, u, u, u, u, u, u, u, "real"], { dataSource: "local-draft" }],
  ] as const)("rejects %s in both layers", async (_name, row, record) => {
    expect(await insertListing([...row])).toBe(true);
    expect(validateListingRecord({ ...sale, ...record } as unknown as Listing)).not.toEqual([]);
  });

  it("rejects a sale with a rent period, an unknown status and a missing property", async () => {
    expect(await insertListing([u, u, u, "sale", "month"])).toBe(true);
    expect(await insertListing([u, u, u, u, u, u, u, "pending"])).toBe(true);
    expect(await insertListing([u, "no-such-property"])).toBe(true);
  });

  it("rejects extra decimals instead of rounding them", async () => {
    expect(await insertListing([u, u, u, u, u, "100000.50"])).toBe(false);
    expect(await insertListing([u, u, u, u, u, "100000.501"])).toBe(true);
  });

  it("stores amounts exactly (NUMERIC), with two decimals", async () => {
    await db.query(LISTING_SQL, [
      "exact-listing",
      "base-property",
      "ზუსტი",
      "sale",
      null,
      "123456.78",
      "GEL",
      "active",
      "demo",
    ]);
    const { rows } = await db.query<{ amount: string; sum: string }>(
      "SELECT asking_amount::text AS amount, (asking_amount + 0.01)::text AS sum FROM listings WHERE id = 'exact-listing'",
    );
    expect(rows[0]).toEqual({ amount: "123456.78", sum: "123456.79" });
  });
});

describe("characteristics and images", () => {
  beforeAll(async () => {
    await seedDemoData(db);
  });

  it("allows yes, no and unknown, and rejects the removed bed item", async () => {
    const insert = (key: string, status: string) =>
      rejects(
        "INSERT INTO listing_equipment (listing_id, equipment_key, status) VALUES ('demo-listing-3', $1, $2)",
        [key, status],
      );
    expect(await insert("dishwasher", "unknown")).toBe(false);
    expect(await insert("bed", "yes")).toBe(true);
    expect(await insert("dishwasher", "maybe")).toBe(true);
    expect(
      await rejects(
        "INSERT INTO property_features (property_id, feature_key, status) VALUES ('demo-property-3', 'topFloor', 'yes')",
        [],
      ),
    ).toBe(true); // derived from floors, never stored
  });

  const IMAGE_SQL = `INSERT INTO listing_images (id, listing_id, sort_order, is_cover, alt, source_kind, scene, src)
    VALUES ($1, 'demo-listing-8', $2, $3, $4, $5, $6, $7)`;

  it("enforces image order, one cover and a consistent source", async () => {
    const image = (
      id: string,
      order: number,
      cover = false,
      alt = "ტესტი",
      kind = "illustration",
      scene: string | null = "yard",
      src: string | null = null,
    ) => [id, order, cover, alt, kind, scene, src];
    await db.query(IMAGE_SQL, image("img-a", 0, true));
    expect(await rejects(IMAGE_SQL, image("img-b", 0))).toBe(true); // same position
    expect(await rejects(IMAGE_SQL, image("img-c", 1, true))).toBe(true); // second cover
    expect(await rejects(IMAGE_SQL, image("img-d", -1))).toBe(true);
    expect(await rejects(IMAGE_SQL, image("img-e", 2, false, " "))).toBe(true); // no alt text
    expect(await rejects(IMAGE_SQL, image("img-f", 3, false, "ფოტო", "photo", null, null))).toBe(
      true,
    );
    expect(
      await rejects(IMAGE_SQL, image("img-g", 4, false, "ფოტო", "photo", null, "/photos/x.jpg")),
    ).toBe(false);

    const images: ListingImage[] = [
      {
        id: "a",
        listingId: "l",
        order: 0,
        isCover: true,
        alt: "a",
        source: { kind: "illustration", scene: "yard" },
      },
      {
        id: "b",
        listingId: "l",
        order: 0,
        isCover: true,
        alt: " ",
        source: { kind: "illustration", scene: "yard" },
      },
    ];
    expect(validateListingImages(images).map((issue) => issue.field)).toEqual([
      "b.order",
      "b.isCover",
      "b.alt",
    ]);
  });
});
