import { describe, expect, it } from "vitest";
import { DataBackendUnavailableError, DataConfigError, resolveDataBackend } from "@/lib/db/config";
import { createPgPool } from "@/lib/db/pg-client";
import { createPostgresRepository } from "@/lib/db/postgres-repository";
import { demoListings, demoProperties } from "@/lib/properties/demo-data";
import { demoListingImages } from "@/lib/properties/demo-images";
import { MAX_PAGE_OFFSET, MAX_PAGE_SIZE, normalizePage } from "@/lib/repository/listing-repository";
import { createMemoryRepository } from "@/lib/repository/memory-repository";
import { createRepository } from "@/lib/repository/select-repository";

const noRate = { status: "unavailable" as const };

describe("page requests", () => {
  it("are clamped to safe bounds", () => {
    expect(normalizePage(undefined)).toEqual({ offset: 0, limit: MAX_PAGE_SIZE });
    expect(normalizePage({ offset: -5, limit: 0 })).toEqual({ offset: 0, limit: 1 });
    expect(normalizePage({ offset: 2.7, limit: 10_000 })).toEqual({
      offset: 2,
      limit: MAX_PAGE_SIZE,
    });
    expect(normalizePage({ offset: 1e9, limit: Number.NaN })).toEqual({
      offset: MAX_PAGE_OFFSET,
      limit: MAX_PAGE_SIZE,
    });
  });
});

describe("memory repository", () => {
  const repository = createMemoryRepository();

  it("serves the demo data in data order, unchanged", async () => {
    expect(repository.backend).toBe("memory");
    expect(await repository.getListingIds()).toEqual(demoListings.map((l) => l.id));
    const item = await repository.getListingById("demo-listing-9");
    expect(item?.listing).toBe(demoListings.find((l) => l.id === "demo-listing-9"));
    expect(item?.property.id).toBe("demo-property-9");
    expect(await repository.getListingById("missing")).toBeNull();
  });

  it("keeps rent prices monthly and original prices untouched in search results", async () => {
    const { items } = await repository.searchListings({
      filters: { transaction: "rent" },
      display: "GEL",
      rateState: noRate,
      sort: "default",
    });
    expect(items.length).toBeGreaterThan(0);
    for (const { listing } of items) {
      expect(listing.transactionType === "rent" && listing.rentPeriod).toBe("month");
      expect(listing.askingPrice).toEqual(
        demoListings.find((l) => l.id === listing.id)!.askingPrice,
      );
    }
  });

  it("hides non-public and non-active listings where required", async () => {
    const inactive = { ...demoListings[0], id: "demo-listing-old", status: "inactive" as const };
    const draft = { ...demoListings[1], id: "demo-listing-draft", status: "pending" as never };
    const custom = createMemoryRepository({
      properties: demoProperties,
      listings: [...demoListings, inactive, draft],
      images: demoListingImages,
    });
    // An ended (inactive) listing can be opened by id but is never searched or compared.
    expect(await custom.getListingById("demo-listing-old")).not.toBeNull();
    expect(await custom.getListingById("demo-listing-draft")).toBeNull();
    const ids = (await custom.getActiveListings()).map((item) => item.listing.id);
    expect(ids).not.toContain("demo-listing-old");
    const search = await custom.searchListings({
      filters: {},
      display: "USD",
      rateState: noRate,
      sort: "default",
    });
    expect(search.items.map((item) => item.listing.id)).not.toContain("demo-listing-old");
    expect(await custom.getListingIds()).not.toContain("demo-listing-draft");
  });

  it("returns covers for listings with and without images", async () => {
    const covers = await repository.getListingCovers(["demo-listing-3", "demo-listing-8"]);
    // demo-listing-3 has an explicit cover that is not the first image.
    expect(covers["demo-listing-3"].coverImage?.id).toBe("demo-listing-3-image-2");
    expect(covers["demo-listing-8"]).toEqual({ coverImage: null, imageCount: 0 });
  });
});

describe("backend selection", () => {
  it("uses memory by default and never falls back silently", async () => {
    expect((await createRepository({ backend: "memory" })).backend).toBe("memory");
    expect(() => resolveDataBackend({ DATA_BACKEND: "postgres" })).toThrow(DataConfigError);
  });

  it("uses PostgreSQL when configured, through the injected client", async () => {
    const calls: string[] = [];
    const repository = await createRepository(
      { backend: "postgres", databaseUrl: "postgres://u@localhost/test" },
      {
        createSqlClient: async () => ({
          async query<Row extends object>(text: string) {
            calls.push(text);
            return { rows: [] as Row[] };
          },
          async exec() {},
        }),
      },
    );
    expect(repository.backend).toBe("postgres");
    expect(await repository.getListingIds()).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("fails with a safe server error when the database cannot be reached (real pg driver)", async () => {
    // Nothing listens on port 1; the pg driver fails to connect within its timeout.
    const pool = createPgPool("postgres://app:hunter2-secret@127.0.0.1:1/none");
    const errors: unknown[] = [];
    const repository = createPostgresRepository(pool, { onError: (e) => errors.push(e) });
    const failure = await repository.getListingById("demo-listing-1").catch((error) => error);
    await pool.end();
    expect(failure).toBeInstanceOf(DataBackendUnavailableError);
    expect(String(failure.message)).not.toContain("hunter2-secret");
    expect(String(failure.message)).not.toContain("127.0.0.1");
    expect(errors).toHaveLength(1);
  }, 20_000);
});
