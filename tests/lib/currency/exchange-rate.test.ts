import { describe, expect, it } from "vitest";
import {
  DEFAULT_DISPLAY_CURRENCY,
  type ExchangeRate,
  assessRateFreshness,
  convertAmount,
  parseNbgUsdRate,
  roundToWholeUnits,
} from "@/lib/currency/exchange-rate";

// Test fixture with easy arithmetic. It is not a claim about any current rate.
const rate: ExchangeRate = {
  source: "nbg",
  gelPerUsd: 2.5,
  effectiveDate: "2026-10-10",
  publishedAt: "2026-10-09T17:01:01.779Z",
};

/** Shape of a real NBG response, with a fixture value. */
function nbgResponse(overrides: Record<string, unknown> = {}): unknown {
  return [
    {
      date: "2026-10-10T00:00:00.000Z",
      currencies: [
        {
          code: "USD",
          quantity: 1,
          rateFormated: "2.6005",
          diffFormated: "0.0014",
          rate: 2.6005,
          name: "US Dollar",
          diff: -0.0014,
          date: "2026-10-09T17:01:01.779Z",
          validFromDate: "2026-10-10T00:00:00.000Z",
          ...overrides,
        },
      ],
    },
  ];
}

describe("DEFAULT_DISPLAY_CURRENCY", () => {
  it("is USD", () => {
    expect(DEFAULT_DISPLAY_CURRENCY).toBe("USD");
  });
});

describe("parseNbgUsdRate", () => {
  it("reads the USD rate, effective date, and publication time", () => {
    expect(parseNbgUsdRate(nbgResponse())).toEqual({
      source: "nbg",
      gelPerUsd: 2.6005,
      effectiveDate: "2026-10-10",
      publishedAt: "2026-10-09T17:01:01.779Z",
    });
  });

  it("divides by quantity", () => {
    expect(parseNbgUsdRate(nbgResponse({ quantity: 10, rate: 26.005 }))?.gelPerUsd).toBeCloseTo(
      2.6005,
    );
  });

  it("falls back to the outer date when validFromDate is missing", () => {
    expect(parseNbgUsdRate(nbgResponse({ validFromDate: undefined }))?.effectiveDate).toBe(
      "2026-10-10",
    );
  });

  it("rejects responses with the wrong shape", () => {
    for (const json of [null, {}, [], [{}], [{ currencies: "x" }], [{ currencies: [] }], "text"]) {
      expect(parseNbgUsdRate(json)).toBeNull();
    }
  });

  it("rejects a response without USD", () => {
    expect(parseNbgUsdRate(nbgResponse({ code: "EUR" }))).toBeNull();
  });

  it("rejects invalid or implausible rates", () => {
    for (const value of [0, -2.6, Number.NaN, "2.6", 0.01, 500]) {
      expect(parseNbgUsdRate(nbgResponse({ rate: value }))).toBeNull();
    }
  });

  it("rejects an invalid quantity", () => {
    for (const quantity of [0, -1, 1.5, "1"]) {
      expect(parseNbgUsdRate(nbgResponse({ quantity }))).toBeNull();
    }
  });

  it("rejects a response without any valid date", () => {
    const json = nbgResponse({ validFromDate: "garbage" }) as [{ date: unknown }];
    json[0].date = "also garbage";
    expect(parseNbgUsdRate(json)).toBeNull();
  });
});

describe("convertAmount", () => {
  it("converts USD to GEL and GEL to USD", () => {
    expect(convertAmount(100, "USD", "GEL", rate)).toBe(250);
    expect(convertAmount(250, "GEL", "USD", rate)).toBe(100);
  });

  it("returns the amount unchanged for the same currency", () => {
    expect(convertAmount(123.45, "GEL", "GEL", rate)).toBe(123.45);
  });

  it("does not round", () => {
    expect(convertAmount(1, "GEL", "USD", rate)).toBe(0.4);
    expect(convertAmount(10, "GEL", "USD", { ...rate, gelPerUsd: 3 })).toBeCloseTo(3.3333, 4);
  });

  it("rejects negative or non-finite amounts", () => {
    expect(() => convertAmount(-1, "USD", "GEL", rate)).toThrow(RangeError);
    expect(() => convertAmount(Number.POSITIVE_INFINITY, "USD", "GEL", rate)).toThrow(RangeError);
  });
});

describe("roundToWholeUnits", () => {
  it("rounds half up to whole units", () => {
    expect(roundToWholeUnits(84615.38)).toBe(84615);
    expect(roundToWholeUnits(84615.5)).toBe(84616);
  });
});

describe("assessRateFreshness", () => {
  it("treats Monday with Saturday's rate as current", () => {
    expect(assessRateFreshness(rate, new Date("2026-10-12T08:00:00Z"))).toBe("current");
  });

  it("does not count a public holiday as a missed business day", () => {
    // Effective Tuesday 13 October; Wednesday 14 is a holiday, so Thursday is only 1 day later.
    expect(
      assessRateFreshness({ ...rate, effectiveDate: "2026-10-13" }, new Date("2026-10-15T08:00Z")),
    ).toBe("current");
  });

  it("flags a rate as possibly outdated after more than two missed business days", () => {
    expect(assessRateFreshness(rate, new Date("2026-10-15T08:00:00Z"))).toBe("possibly-outdated");
  });

  it("uses the Georgian date, not UTC", () => {
    // 21:00 UTC on Wednesday 14 Oct is already Thursday 15 Oct in Tbilisi.
    expect(assessRateFreshness(rate, new Date("2026-10-14T21:00:00Z"))).toBe("possibly-outdated");
    expect(assessRateFreshness(rate, new Date("2026-10-14T18:00:00Z"))).toBe("current");
  });
});
