import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertValidDataset, seedDemoData } from "@/lib/db/seed-demo";
import { DEMO_DATASET } from "@/lib/repository/memory-repository";
import { type TestDatabase, createTestDatabase } from "./test-database";

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(() => db.close());

describe("development demo seed", () => {
  it("accepts the demo dataset under the database rules", () => {
    expect(() => assertValidDataset(DEMO_DATASET)).not.toThrow();
  });

  it("refuses invalid records before touching the database", async () => {
    const broken = {
      ...DEMO_DATASET,
      listings: [
        { ...DEMO_DATASET.listings[0], askingPrice: { amount: 0, currency: "USD" as const } },
      ],
    };
    expect(() => assertValidDataset(broken)).toThrow("demo-listing-1.askingPrice");
    await expect(seedDemoData(db, broken)).rejects.toThrow("Invalid demo data");
    const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM listings");
    expect(rows[0].n).toBe(0);
  });

  it("is repeatable: same rows, same ids, same default order", async () => {
    const first = await seedDemoData(db);
    const order = async () =>
      (await db.query<{ id: string }>("SELECT id FROM listings ORDER BY seq")).rows.map(
        (r) => r.id,
      );
    const before = await order();
    const second = await seedDemoData(db);
    expect(second).toEqual(first);
    expect(await order()).toEqual(before);
    expect(before).toEqual(DEMO_DATASET.listings.map((listing) => listing.id));
    const counts = await db.query<{ p: number; l: number; i: number; f: number }>(
      `SELECT (SELECT count(*) FROM properties)::int AS p, (SELECT count(*) FROM listings)::int AS l,
              (SELECT count(*) FROM listing_images)::int AS i,
              (SELECT count(*) FROM property_features)::int AS f`,
    );
    expect(counts.rows[0]).toMatchObject({ p: 11, l: 11, i: DEMO_DATASET.images.length });
  });

  it("labels everything as demo and invents no publication dates", async () => {
    const { rows } = await db.query<{ sources: string[]; published: number }>(
      `SELECT array_agg(DISTINCT data_source) AS sources,
              count(published_at)::int AS published FROM listings`,
    );
    expect(rows[0]).toEqual({ sources: ["demo"], published: 0 });
  });
});
