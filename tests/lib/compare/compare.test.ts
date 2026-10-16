import { describe, expect, it, vi } from "vitest";
import {
  COMPARE_MESSAGES,
  COMPARE_STORAGE_KEY,
  MAX_COMPARE,
  type TransactionLookup,
  addToComparison,
  getComparisonReadiness,
  parseStoredComparison,
  pruneComparison,
  removeFromComparison,
  serializeComparison,
} from "@/lib/compare/compare-selection";
import {
  CELL_TEXT,
  COMPARISON_ROWS,
  buildComparisonColumns,
  findExtremes,
  visibleRows,
} from "@/lib/compare/comparison";
import type { ExchangeRateState } from "@/lib/currency/exchange-rate";
import { getListingDisplayPrice } from "@/lib/pricing/display-price";
import { formatDisplayAmount } from "@/lib/pricing/format-display-price";
import {
  getActiveDemoListingsWithProperties,
  getDemoListingWithProperty,
} from "@/lib/properties/get-demo-listing";
import { createPersistentStore, sameStrings } from "@/lib/storage/persistent-store";

const all = getActiveDemoListingsWithProperties();
const lookup: TransactionLookup = (id) =>
  all.find((item) => item.listing.id === id)?.listing.transactionType;
// demo-listing-1..8 are for sale, 9..11 are monthly rentals.
const sale = (n: number) => `demo-listing-${n}`;

// Fixture rate with easy arithmetic, not a claim about any current rate.
const rate: ExchangeRateState = {
  status: "available",
  freshness: "current",
  rate: { source: "nbg", gelPerUsd: 2.5, effectiveDate: "2026-10-10", publishedAt: null },
};
const noRate: ExchangeRateState = { status: "unavailable" };

function columnsFor(ids: string[], display: "USD" | "GEL" = "USD", rateState = rate) {
  const items = ids.map((id) => getDemoListingWithProperty(id)!);
  return buildComparisonColumns(items, () => ({ href: "", coverImage: null }), display, rateState);
}

describe("comparison selection", () => {
  it("adds, removes and refuses duplicates", () => {
    let ids: string[] = [];
    ids = addToComparison(ids, sale(1), lookup).ids;
    ids = addToComparison(ids, sale(2), lookup).ids;
    expect(ids).toEqual([sale(1), sale(2)]);
    expect(addToComparison(ids, sale(1), lookup)).toEqual({ ids, outcome: "already-selected" });
    expect(removeFromComparison(ids, sale(1))).toEqual([sale(2)]);
  });

  it("allows at most four listings and keeps the selection when refusing a fifth", () => {
    let ids: string[] = [];
    for (const n of [1, 2, 3, 4]) ids = addToComparison(ids, sale(n), lookup).ids;
    expect(ids).toHaveLength(MAX_COMPARE);
    const fifth = addToComparison(ids, sale(5), lookup);
    expect(fifth).toEqual({ ids, outcome: "full" });
    expect(COMPARE_MESSAGES.full).toContain("4");
  });

  it("never mixes sale and monthly rent, and keeps the existing selection", () => {
    const ids = [sale(1), sale(2)];
    const result = addToComparison(ids, "demo-listing-9", lookup);
    expect(result).toEqual({ ids, outcome: "mixed-transaction" });
    expect(COMPARE_MESSAGES["mixed-transaction"]).toContain("თვიური ქირა");
    // Rentals can be compared with rentals.
    expect(addToComparison(["demo-listing-9"], "demo-listing-10", lookup).outcome).toBe("added");
  });

  it("refuses unknown listings and ignores deleted ones", () => {
    expect(addToComparison([], "deleted-listing", lookup).outcome).toBe("invalid");
    expect(pruneComparison([sale(1), "deleted-listing"], lookup)).toEqual([sale(1)]);
    // A deleted listing does not block adding a fourth valid one.
    const ids = ["deleted-listing", sale(1), sale(2), sale(3)];
    expect(addToComparison(ids, sale(4), lookup)).toEqual({
      ids: [sale(1), sale(2), sale(3), sale(4)],
      outcome: "added",
    });
  });

  it("needs two listings of one transaction type", () => {
    expect(getComparisonReadiness([sale(1)], lookup)).toEqual({ ready: false, reason: "too-few" });
    expect(getComparisonReadiness([sale(1), sale(2)], lookup)).toEqual({
      ready: true,
      transaction: "sale",
    });
    expect(getComparisonReadiness([sale(1), "demo-listing-9"], lookup)).toEqual({
      ready: false,
      reason: "mixed-transaction",
    });
  });
});

describe("stored comparison", () => {
  it("round-trips ids and rejects corrupted data", () => {
    expect(parseStoredComparison(serializeComparison([sale(3), sale(1)]))).toEqual([
      sale(3),
      sale(1),
    ]);
    expect(parseStoredComparison("{oops")).toEqual([]);
    expect(parseStoredComparison('{"version":2,"ids":["demo-listing-1"]}')).toEqual([]);
    expect(
      parseStoredComparison(
        JSON.stringify({
          version: 1,
          ids: [sale(1), sale(1), "!!", 3, sale(2), sale(3), sale(4), sale(5)],
        }),
      ),
    ).toEqual([sale(1), sale(2), sale(3), sale(4)]);
  });

  it("persists across reloads with the shared store and survives storage failures", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    };
    const options = {
      key: COMPARE_STORAGE_KEY,
      empty: [] as readonly string[],
      parse: parseStoredComparison,
      serialize: serializeComparison,
      equals: sameStrings,
    };
    const store = createPersistentStore(options, () => storage);
    const listener = vi.fn();
    store.subscribe(listener);
    store.update((ids) => addToComparison(ids, sale(1), lookup).ids);
    store.update((ids) => addToComparison(ids, sale(2), lookup).ids);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(createPersistentStore(options, () => storage).getSnapshot().value).toEqual([
      sale(1),
      sale(2),
    ]);
    const blocked = createPersistentStore(options, () => {
      throw new Error("blocked");
    });
    expect(blocked.getSnapshot().status).toBe("memory-only");
    blocked.update(() => [sale(1)]);
    expect(blocked.getSnapshot()).toEqual({ value: [sale(1)], status: "memory-only" });
    // Another tab changed the selection.
    store.handleStorageChange(COMPARE_STORAGE_KEY, serializeComparison([sale(4)]));
    expect(store.getSnapshot().value).toEqual([sale(4)]);
  });
});

describe("comparison columns", () => {
  it("shows the same prices as listing cards, in USD or GEL", () => {
    for (const display of ["USD", "GEL"] as const) {
      const [column] = columnsFor([sale(4)], display);
      const item = getDemoListingWithProperty(sale(4))!;
      expect(column.cells.price).toEqual({
        kind: "value",
        text: formatDisplayAmount(getListingDisplayPrice(item, display, rate)),
      });
    }
    // demo-listing-4 is ₾165,000: "≈ $66,000" in USD at 2.5, original kept.
    const [usd] = columnsFor([sale(4)]);
    expect(usd.cells.price).toEqual({ kind: "value", text: "≈ $66,000" });
    expect(usd.cells.originalPrice).toEqual({ kind: "value", text: "₾165,000 (GEL)" });
  });

  it("keeps monthly units for rentals", () => {
    const [rent] = columnsFor(["demo-listing-9"]);
    expect(rent.cells.price).toMatchObject({ text: expect.stringMatching(/\/ თვე$/) });
    // Rentals show no price per m² (the row is hidden when only rentals are compared).
    expect(rent.cells.pricePerSqm).toEqual({ kind: "not-applicable" });
    expect(rent.numbers.pricePerSqm).toBeNull();
    expect(visibleRows([rent]).some((row) => row.key === "pricePerSqm")).toBe(false);
    expect(rent.cells.area).toMatchObject({ text: expect.stringContaining("მ²") });
    expect(rent.cells.originalPrice).toMatchObject({ text: expect.stringContaining("/ თვე") });
  });

  it("marks facts of the other property type as not applicable, not as missing", () => {
    const [apartment, house] = columnsFor([sale(1), sale(7)]);
    expect(apartment.cells.floor).toEqual({ kind: "value", text: "5 / 12" });
    expect(apartment.cells.storeys).toEqual({ kind: "not-applicable" });
    expect(apartment.cells.landArea).toEqual({ kind: "not-applicable" });
    expect(house.cells.floor).toEqual({ kind: "not-applicable" });
    expect(house.cells["amenity-elevator"]).toEqual({ kind: "not-applicable" });
    expect(house.cells["amenity-topFloor"]).toEqual({ kind: "not-applicable" });
  });

  it("distinguishes known yes, known no and not specified", () => {
    const [vake] = columnsFor([sale(1)]);
    expect(vake.cells["amenity-balcony"]).toEqual({ kind: "amenity", status: "yes" });
    expect(vake.cells["amenity-basement"]).toEqual({ kind: "amenity", status: "no" });
    expect(vake.cells["amenity-parking"]).toEqual({ kind: "amenity", status: "unknown" });
    expect(CELL_TEXT.unknown).toBe("არ არის მითითებული");
    expect(CELL_TEXT["not-applicable"]).toBe("არ გამოიყენება");
  });

  it("marks unknown structural facts as not specified", () => {
    // demo-listing-8 is a house without a stated yard area and with an unknown location.
    const [house] = columnsFor([sale(8)]);
    expect(house.cells.landArea).toEqual({ kind: "unknown" });
    expect(house.cells.storeys).toEqual({ kind: "value", text: "2" });
    expect(house.cells.location).toEqual({
      kind: "value",
      text: "მდებარეობა რუქაზე არ არის მითითებული",
    });
    const [apartment] = columnsFor([sale(4)]);
    // demo-listing-4 has no total floors: the floor is shown without a fake total.
    expect(apartment.cells.floor).toEqual({ kind: "value", text: "2" });
  });

  it("hides rows that apply to none of the compared listings", () => {
    const apartmentsOnly = visibleRows(columnsFor([sale(1), sale(2)])).map((row) => row.key);
    expect(apartmentsOnly).toContain("floor");
    expect(apartmentsOnly).not.toContain("storeys");
    expect(apartmentsOnly).not.toContain("landArea");
    const mixedTypes = visibleRows(columnsFor([sale(1), sale(7)])).map((row) => row.key);
    expect(mixedTypes).toEqual(expect.arrayContaining(["floor", "storeys", "landArea"]));
    // Amenity rows that apply to no compared listing are hidden too (no elevator for houses).
    const housesOnly = visibleRows(columnsFor([sale(7), sale(8)])).map((row) => row.key);
    expect(housesOnly).not.toContain("amenity-elevator");
    expect(housesOnly).not.toContain("floor");
    expect(COMPARISON_ROWS.map((row) => row.key)).toContain("amenity-elevator");
  });

  it("highlights extremes from unrounded numbers in one currency", () => {
    // $150,000 (1), ₾165,000 = $66,000 (4), $320,000 (7)
    const columns = columnsFor([sale(1), sale(4), sale(7)]);
    expect(findExtremes(columns, "price")).toEqual({ lowest: [sale(4)], highest: [sale(7)] });
    expect(columns[1].numbers.price).toBe(66_000);
    // The same order in GEL: the display currency does not change the comparison.
    expect(findExtremes(columnsFor([sale(1), sale(4), sale(7)], "GEL"), "price")).toEqual({
      lowest: [sale(4)],
      highest: [sale(7)],
    });
  });

  it("does not claim a GEL listing is cheaper than a USD listing without an exchange rate", () => {
    const columns = columnsFor([sale(1), sale(4)], "USD", noRate);
    expect(columns[1].cells.price).toEqual({ kind: "value", text: "₾165,000" });
    expect(findExtremes(columns, "price")).toBeNull();
    expect(findExtremes(columns, "pricePerSqm")).toBeNull();
    // Area needs no exchange rate.
    expect(findExtremes(columns, "area")).not.toBeNull();
  });

  it("calculates price per m² like the rest of the site", () => {
    const [vake] = columnsFor([sale(1)]);
    expect(vake.cells.pricePerSqm).toEqual({ kind: "value", text: "$2,307.69 / მ²" });
    expect(vake.numbers.pricePerSqm).toBeCloseTo(150_000 / 65, 6);
  });
});
