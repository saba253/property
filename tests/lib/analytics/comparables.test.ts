import { describe, expect, it } from "vitest";
import {
  AREA_TOLERANCE,
  MIN_COMPARABLES,
  areaRange,
  isWithinAreaRange,
  selectComparables,
} from "@/lib/analytics/comparables";
import { comparablesWithPerSqm, synthetic } from "./fixtures";

const subject = synthetic("subject", { area: 100, price: 200000 });
const ids = (selection: ReturnType<typeof selectComparables>) =>
  selection.status === "enough" ? selection.comparables.map((item) => item.listing.id) : [];

describe("comparable selection rules", () => {
  it("documents the defaults: ±25% area and at least five comparables", () => {
    expect(AREA_TOLERANCE).toBe(0.25);
    expect(MIN_COMPARABLES).toBe(5);
    expect(areaRange(80)).toEqual({ min: 60, max: 100 });
  });

  it("uses same-district comparables when there are enough", () => {
    const district = comparablesWithPerSqm([1, 2, 3, 4, 5]);
    const elsewhere = comparablesWithPerSqm([6, 7], { district: "უბანი-2" }).map((item, i) =>
      synthetic(`d2-${i}`, { district: "უბანი-2", price: item.listing.askingPrice.amount }),
    );
    const result = selectComparables(subject, [...district, ...elsewhere]);
    expect(result).toMatchObject({ status: "enough", scope: "district", districtCount: 5 });
    expect(result.status === "enough" && result.cityCount).toBe(7);
    expect(ids(result)).toHaveLength(5);
  });

  it("falls back to the same city, explicitly, when the district has too few", () => {
    const candidates = [
      ...comparablesWithPerSqm([1, 2]),
      synthetic("x1", { district: "უბანი-2" }),
      synthetic("x2", { district: "უბანი-3" }),
      synthetic("x3", { district: "უბანი-3" }),
    ];
    const result = selectComparables(subject, candidates);
    expect(result).toMatchObject({ status: "enough", scope: "city", districtCount: 2 });
    expect(ids(result)).toHaveLength(5);
  });

  it("never mixes cities, property types or sale and rent", () => {
    const candidates = [
      ...comparablesWithPerSqm([1, 2, 3, 4], { city: "ქალაქი-ბ" }),
      ...comparablesWithPerSqm([1, 2, 3, 4], { type: "house" }).map((item, i) =>
        synthetic(`h${i}`, { type: "house", price: item.listing.askingPrice.amount }),
      ),
      ...[1, 2, 3, 4].map((i) => synthetic(`r${i}`, { transaction: "rent", price: 1500 })),
      synthetic("same"),
    ];
    expect(selectComparables(subject, candidates)).toEqual({
      status: "insufficient",
      districtCount: 1,
      cityCount: 1,
    });
  });

  it("keeps rentals with rentals (monthly)", () => {
    const rentSubject = synthetic("rs", { transaction: "rent", price: 1500 });
    const rentals = [1, 2, 3, 4, 5].map((i) =>
      synthetic(`r${i}`, { transaction: "rent", price: 1000 + i * 100 }),
    );
    const sales = [1, 2, 3].map((i) => synthetic(`s${i}`));
    const result = selectComparables(rentSubject, [...sales, ...rentals]);
    expect(ids(result)).toEqual(rentals.map((item) => item.listing.id));
  });

  it("excludes the subject and other offers of the same physical property", () => {
    const relisted = synthetic("relisted", { propertyId: subject.listing.propertyId });
    const twice = synthetic("dup", { propertyId: "shared" });
    const twiceAgain = synthetic("dup-later", { propertyId: "shared" });
    const result = selectComparables(subject, [
      subject,
      relisted,
      twice,
      twiceAgain,
      twice,
      ...comparablesWithPerSqm([1, 2, 3]),
    ]);
    expect(result).toEqual({ status: "insufficient", districtCount: 4, cityCount: 4 });
    const withOneMore = selectComparables(subject, [
      twiceAgain,
      twice,
      ...comparablesWithPerSqm([1, 2, 3, 4]),
    ]);
    // One listing per physical property: the lowest listing id is kept.
    expect(ids(withOneMore)).toContain(twice.listing.id);
    expect(ids(withOneMore)).not.toContain(twiceAgain.listing.id);
  });

  it("includes both ±25% area boundaries and excludes values just outside", () => {
    expect(isWithinAreaRange(100, 75)).toBe(true);
    expect(isWithinAreaRange(100, 125)).toBe(true);
    expect(isWithinAreaRange(100, 74.99)).toBe(false);
    expect(isWithinAreaRange(100, 125.01)).toBe(false);
    const candidates = [75, 125, 74.9, 125.1, 100, 90, 110].map((area, i) =>
      synthetic(`a${i}`, { area }),
    );
    expect(selectComparables(subject, candidates)).toMatchObject({ cityCount: 5 });
  });

  it("needs at least five: exactly five is enough, four is not", () => {
    expect(selectComparables(subject, comparablesWithPerSqm([1, 2, 3, 4, 5])).status).toBe(
      "enough",
    );
    expect(selectComparables(subject, comparablesWithPerSqm([1, 2, 3, 4]))).toEqual({
      status: "insufficient",
      districtCount: 4,
      cityCount: 4,
    });
  });

  it("handles an empty dataset", () => {
    expect(selectComparables(subject, [])).toEqual({
      status: "insufficient",
      districtCount: 0,
      cityCount: 0,
    });
  });

  it("skips invalid prices and areas, and inactive listings", () => {
    const bad = [
      synthetic("p0", { price: 0 }),
      synthetic("pn", { price: -5 }),
      synthetic("pnan", { price: Number.NaN }),
      synthetic("a0", { area: 0 }),
      synthetic("ainf", { area: Number.POSITIVE_INFINITY }),
      synthetic("inactive", { status: "inactive" }),
    ];
    expect(selectComparables(subject, bad)).toMatchObject({ cityCount: 0 });
    expect(selectComparables(synthetic("s0", { area: 0 }), bad)).toEqual({
      status: "invalid-subject",
    });
    expect(selectComparables(synthetic("sp", { price: 0 }), bad)).toEqual({
      status: "invalid-subject",
    });
  });

  it("uses the city when the subject's district is unknown", () => {
    const unknown = synthetic("u", { district: "  " });
    const result = selectComparables(unknown, comparablesWithPerSqm([1, 2, 3, 4, 5]));
    expect(result).toMatchObject({ status: "enough", scope: "city", districtCount: 0 });
  });

  it("does not modify its input and is deterministic", () => {
    const candidates = comparablesWithPerSqm([5, 3, 1, 4, 2, 6]);
    const copy = structuredClone(candidates);
    const forward = selectComparables(subject, candidates);
    const backward = selectComparables(subject, [...candidates].reverse());
    expect(candidates).toEqual(copy);
    expect(forward).toEqual(backward);
  });
});
