import { describe, expect, it } from "vitest";
import { buildListingsHref } from "@/lib/properties/filter-chips";
import {
  MAX_PAGE,
  PAGE_SIZE,
  lastPageOf,
  pageNumbers,
  pageRequest,
  parsePage,
} from "@/lib/properties/listing-page";

describe("page parameter", () => {
  it("defaults to page 1 and accepts whole numbers in range", () => {
    expect(parsePage({})).toEqual({ page: 1, invalid: false });
    expect(parsePage({ page: "3" })).toEqual({ page: 3, invalid: false });
    expect(parsePage({ page: [" 2 ", "9"] })).toEqual({ page: 2, invalid: false });
    expect(parsePage({ page: String(MAX_PAGE) })).toEqual({ page: MAX_PAGE, invalid: false });
  });

  it.each(["0", "-2", "1.5", "abc", "1e3", String(MAX_PAGE + 1), "9999999"])(
    "falls back to page 1 with a notice for %s",
    (value) => {
      expect(parsePage({ page: value })).toEqual({ page: 1, invalid: true });
    },
  );

  it("maps pages to bounded repository requests", () => {
    expect(PAGE_SIZE).toBe(12);
    expect(pageRequest(1)).toEqual({ offset: 0, limit: 12 });
    expect(pageRequest(3)).toEqual({ offset: 24, limit: 12 });
    expect(pageRequest(MAX_PAGE).offset).toBeLessThanOrEqual(10_000);
  });
});

describe("page numbers", () => {
  it("knows the last page only from an exact total", () => {
    expect(lastPageOf(0, true)).toBe(1);
    expect(lastPageOf(24, true)).toBe(2);
    expect(lastPageOf(25, true)).toBe(3);
    expect(lastPageOf(1000, false)).toBeNull();
  });

  it("shows first, last and neighbours with gaps", () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(1, 5)).toEqual([1, 2, null, 5]);
    expect(pageNumbers(7, 20)).toEqual([1, null, 6, 7, 8, null, 20]);
    expect(pageNumbers(20, 20)).toEqual([1, null, 19, 20]);
    // Unknown total: no invented last page.
    expect(pageNumbers(5, null)).toEqual([1, null, 4, 5]);
  });
});

describe("page in URLs", () => {
  it("is added only from page 2 and kept last, after every other setting", () => {
    expect(buildListingsHref({ citySlug: "tbilisi" }, "GEL", "map", "price_asc", 3)).toBe(
      "/properties?display=GEL&view=map&sort=price_asc&city=tbilisi&page=3",
    );
    expect(buildListingsHref({ citySlug: "tbilisi" }, "USD", "list", "default", 1)).toBe(
      "/properties?city=tbilisi",
    );
    // Old links without `page` stay valid and mean page 1.
    expect(buildListingsHref({ transaction: "rent" })).toBe("/properties?transaction=rent");
  });
});
