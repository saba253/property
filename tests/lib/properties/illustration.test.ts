import { describe, expect, it } from "vitest";
import { pickIllustrationVariant } from "@/lib/properties/illustration";

describe("pickIllustrationVariant", () => {
  it("returns the same variant for the same seed", () => {
    expect(pickIllustrationVariant("demo-listing-1", 4)).toBe(
      pickIllustrationVariant("demo-listing-1", 4),
    );
  });

  it("always returns an index within range", () => {
    for (const seed of ["", "a", "demo-listing-1", "demo-listing-2", "ბინა ვაკეში"]) {
      const variant = pickIllustrationVariant(seed, 3);
      expect(Number.isInteger(variant) && variant >= 0 && variant < 3).toBe(true);
    }
  });

  it("gives the two demo listings different variants", () => {
    expect(pickIllustrationVariant("demo-listing-1", 4)).not.toBe(
      pickIllustrationVariant("demo-listing-2", 4),
    );
  });

  it("rejects an invalid count", () => {
    expect(() => pickIllustrationVariant("x", 0)).toThrow(RangeError);
    expect(() => pickIllustrationVariant("x", 1.5)).toThrow(RangeError);
  });
});
