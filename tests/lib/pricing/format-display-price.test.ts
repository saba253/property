import { describe, expect, it } from "vitest";
import type { DisplayPrice } from "@/lib/pricing/display-price";
import {
  formatDisplayAmount,
  formatDisplayPricePerSqm,
  originalPriceNote,
  periodSuffix,
} from "@/lib/pricing/format-display-price";

const converted: DisplayPrice = {
  original: { amount: 220000, currency: "GEL" },
  currency: "USD",
  amount: 84615,
  pricePerSqm: 1744.64,
  isConverted: true,
  period: null,
};
const native: DisplayPrice = {
  original: { amount: 150000, currency: "USD" },
  currency: "USD",
  amount: 150000,
  pricePerSqm: 2307.69,
  isConverted: false,
  period: null,
};
const unavailable: DisplayPrice = {
  original: { amount: 220000, currency: "GEL" },
  currency: "USD",
  amount: null,
  pricePerSqm: null,
  isConverted: false,
  period: null,
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

describe("rental prices", () => {
  const rentConverted: DisplayPrice = {
    original: { amount: 1800, currency: "GEL" },
    currency: "USD",
    amount: 692,
    pricePerSqm: 15.38,
    isConverted: true,
    period: "month",
  };
  const rentNative: DisplayPrice = {
    original: { amount: 1200, currency: "USD" },
    currency: "USD",
    amount: 1200,
    pricePerSqm: 17.14,
    isConverted: false,
    period: "month",
  };
  const rentUnavailable: DisplayPrice = { ...rentConverted, amount: null, pricePerSqm: null };

  it("always shows the monthly unit on the price", () => {
    expect(formatDisplayAmount(rentConverted)).toBe("≈ $692 / თვე");
    expect(formatDisplayAmount(rentNative)).toBe("$1,200 / თვე");
    expect(formatDisplayAmount(rentUnavailable)).toBe("₾1,800 / თვე");
  });

  it("shows no price per m² for rentals, but keeps the number and the monthly rent", () => {
    expect(formatDisplayPricePerSqm(rentConverted)).toBeNull();
    expect(formatDisplayPricePerSqm(rentNative)).toBeNull();
    expect(rentNative.pricePerSqm).not.toBeNull();
    expect(formatDisplayAmount(rentNative)).toMatch(/ \/ თვე$/);
  });

  it("still shows the price per m² for sale prices", () => {
    expect(formatDisplayPricePerSqm(native)).toMatch(/\/ მ²$/);
    expect(formatDisplayPricePerSqm(native)).not.toContain("თვე");
  });

  it("names the original monthly rent", () => {
    expect(originalPriceNote(rentConverted)).toBe("ორიგინალი ქირა: ₾1,800 / თვე (GEL)");
    expect(originalPriceNote(rentNative)).toBe("ორიგინალი ქირა USD-ში");
  });

  it("never adds a period to sale prices", () => {
    expect(periodSuffix(null)).toBe("");
    expect(formatDisplayAmount(native)).not.toContain("თვე");
  });
});
