import { describe, expect, it } from "vitest";
import {
  FEATURED_CITY_SLUG,
  FEATURED_LIMIT,
  interleaveFeatured,
  selectFeaturedListings,
} from "@/lib/properties/featured";
import { createMemoryRepository } from "@/lib/repository/memory-repository";

describe("featured Tbilisi listings (homepage carousel)", () => {
  const repository = createMemoryRepository();

  it("selects public Tbilisi listings only, sale and rent alternating, at most 8", async () => {
    const featured = await selectFeaturedListings(repository, FEATURED_CITY_SLUG, FEATURED_LIMIT);
    expect(featured.length).toBeGreaterThan(0);
    expect(featured.length).toBeLessThanOrEqual(FEATURED_LIMIT);
    expect(featured.every((item) => item.property.city === "თბილისი")).toBe(true);
    expect(featured.every((item) => item.listing.status === "active")).toBe(true);
    const kinds = featured.map((item) => item.listing.transactionType);
    expect(kinds).toContain("sale");
    expect(kinds).toContain("rent");
    expect(kinds[0]).toBe("sale");
    expect(new Set(featured.map((item) => item.listing.id)).size).toBe(featured.length);
  });

  it("is deterministic (no popularity data is invented)", async () => {
    const a = await selectFeaturedListings(repository, FEATURED_CITY_SLUG, FEATURED_LIMIT);
    const b = await selectFeaturedListings(repository, FEATURED_CITY_SLUG, FEATURED_LIMIT);
    expect(b.map((i) => i.listing.id)).toEqual(a.map((i) => i.listing.id));
  });

  it("interleaves, keeps order, skips duplicates and respects the limit", async () => {
    const all = (await repository.getActiveListings()).slice(0, 6);
    const [s1, s2, s3, r1, r2] = all;
    const ids = (items: typeof all) => items.map((i) => i.listing.id);
    expect(ids(interleaveFeatured([s1, s2, s3], [r1, r2], 8))).toEqual(ids([s1, r1, s2, r2, s3]));
    expect(ids(interleaveFeatured([s1, s2], [s1, r1], 8))).toEqual(ids([s1, s2, r1]));
    expect(interleaveFeatured([s1, s2, s3], [r1, r2], 3)).toHaveLength(3);
    expect(interleaveFeatured([], [], 8)).toEqual([]);
  });
});
