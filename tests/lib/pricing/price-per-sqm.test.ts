import { describe, expect, it } from "vitest";
import { calculateAskingPricePerSqm } from "@/lib/pricing/price-per-sqm";

describe("calculateAskingPricePerSqm", () => {
  it("divides the asking price by the area", () => {
    expect(calculateAskingPricePerSqm(100000, 50)).toBe(2000);
  });

  it("rounds down to 2 decimal places", () => {
    // 150000 / 65 = 2307.6923...
    expect(calculateAskingPricePerSqm(150000, 65)).toBe(2307.69);
  });

  it("rounds up to 2 decimal places", () => {
    // 100000 / 60 = 1666.6666...
    expect(calculateAskingPricePerSqm(100000, 60)).toBe(1666.67);
  });

  it("works with fractional areas", () => {
    expect(calculateAskingPricePerSqm(90000, 45.5)).toBe(1978.02);
  });

  it("throws when the area is zero or negative", () => {
    expect(() => calculateAskingPricePerSqm(100000, 0)).toThrow(RangeError);
    expect(() => calculateAskingPricePerSqm(100000, -10)).toThrow(RangeError);
  });

  it("throws when the asking price is zero or negative", () => {
    expect(() => calculateAskingPricePerSqm(0, 50)).toThrow(RangeError);
    expect(() => calculateAskingPricePerSqm(-100000, 50)).toThrow(RangeError);
  });

  it("throws when an input is not a finite number", () => {
    expect(() => calculateAskingPricePerSqm(Number.NaN, 50)).toThrow(RangeError);
    expect(() => calculateAskingPricePerSqm(100000, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
