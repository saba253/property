import { describe, expect, it } from "vitest";
import type { DisplayPrice } from "@/lib/pricing/display-price";
import {
  formatDisplayAmount,
  formatDisplayPricePerSqm,
  originalPriceNote,
} from "@/lib/pricing/format-display-price";

const converted: DisplayPrice = {
  original: { amount: 220000, currency: "GEL" },
  currency: "USD",
  amount: 84615,
  pricePerSqm: 1744.64,
  isConverted: true,
};
const native: DisplayPrice = {
  original: { amount: 150000, currency: "USD" },
  currency: "USD",
  amount: 150000,
  pricePerSqm: 2307.69,
  isConverted: false,
};
const unavailable: DisplayPrice = {
  original: { amount: 220000, currency: "GEL" },
  currency: "USD",
  amount: null,
  pricePerSqm: null,
  isConverted: false,
};

describe("formatDisplayAmount", () => {
  it("marks converted prices as approximate", () => {
    expect(formatDisplayAmount(converted)).toBe("≈ $84,615");
  });

  it("shows same-currency prices without the approximate sign", () => {
    expect(formatDisplayAmount(native)).toBe("$150,000");
  });

  it("falls back to the original price when conversion is unavailable", () => {
    expect(formatDisplayAmount(unavailable)).toBe("₾220,000");
  });
});

describe("formatDisplayPricePerSqm", () => {
  it("formats converted and native values", () => {
    expect(formatDisplayPricePerSqm(converted)).toBe("≈ $1,744.64 / მ²");
    expect(formatDisplayPricePerSqm(native)).toBe("$2,307.69 / მ²");
  });

  it("returns null when it cannot be shown", () => {
    expect(formatDisplayPricePerSqm(unavailable)).toBeNull();
  });
});

describe("originalPriceNote", () => {
  it("names the original price and currency", () => {
    expect(originalPriceNote(converted)).toBe("ორიგინალი ფასი: ₾220,000 (GEL)");
    expect(originalPriceNote(native)).toBe("ორიგინალი ფასი USD-ში");
    expect(originalPriceNote(unavailable)).toBe(
      "ორიგინალი ფასი (GEL). USD-ში გადაყვანა ამჟამად მიუწვდომელია.",
    );
  });
});
