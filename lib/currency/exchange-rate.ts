import {
  countBusinessDaysAfter,
  dateInTbilisi,
  parseIsoDate,
} from "@/lib/currency/georgian-calendar";
import type { Currency } from "@/lib/properties/types";

/** USD is the default currency for displaying prices and price filters. */
export const DEFAULT_DISPLAY_CURRENCY: Currency = "USD";

/**
 * Official NBG rate for one US dollar in lari. This is the National Bank of Georgia's official
 * (indicative) daily rate, not a real-time buying or selling quote from a bank.
 */
export type ExchangeRate = {
  source: "nbg";
  /** 1 USD = gelPerUsd GEL. */
  gelPerUsd: number;
  /** Calendar date from which the rate is valid, "YYYY-MM-DD". */
  effectiveDate: string;
  /** When NBG published the rate (ISO timestamp), when provided. */
  publishedAt: string | null;
};

/**
 * "current": no more than the allowed number of Georgian business days have passed since the
 * rate took effect. "possibly-outdated": more have passed; holidays may explain it, so the UI
 * must word this as uncertain.
 */
export type RateFreshness = "current" | "possibly-outdated";

export type ExchangeRateState =
  { status: "available"; rate: ExchangeRate; freshness: RateFreshness } | { status: "unavailable" };

/**
 * NBG publishes each business day's rate in the afternoon, valid from the next calendar day.
 * On an ordinary Monday the newest rate took effect on Saturday, one business day earlier.
 * Allowing two business days tolerates one late or missing publication before warning.
 */
export const MAX_BUSINESS_DAYS_WITHOUT_UPDATE = 2;

// Sanity bounds that reject garbage values without assuming any particular current rate.
const MIN_PLAUSIBLE_GEL_PER_USD = 0.5;
const MAX_PLAUSIBLE_GEL_PER_USD = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Extracts "YYYY-MM-DD" from an ISO timestamp such as "2026-10-10T00:00:00.000Z". */
function isoDatePart(value: unknown): string | null {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return null;
  }
  const datePart = value.slice(0, 10);
  return parseIsoDate(datePart) ? datePart : null;
}

/**
 * Validates an NBG currencies API response and returns the USD rate, or null if the response
 * does not have the expected shape or contains an implausible value.
 *
 * Expected shape: [{ date, currencies: [{ code: "USD", quantity, rate, validFromDate, date }] }]
 */
export function parseNbgUsdRate(json: unknown): ExchangeRate | null {
  if (!Array.isArray(json) || json.length === 0 || !isRecord(json[0])) {
    return null;
  }
  const currencies = json[0].currencies;
  if (!Array.isArray(currencies)) {
    return null;
  }
  const usd = currencies.find((item) => isRecord(item) && item.code === "USD");
  if (!isRecord(usd)) {
    return null;
  }

  const { quantity, rate } = usd;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
    return null;
  }
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    return null;
  }
  const gelPerUsd = rate / quantity;
  if (gelPerUsd < MIN_PLAUSIBLE_GEL_PER_USD || gelPerUsd > MAX_PLAUSIBLE_GEL_PER_USD) {
    return null;
  }

  const effectiveDate = isoDatePart(usd.validFromDate) ?? isoDatePart(json[0].date);
  if (!effectiveDate) {
    return null;
  }
  const publishedAt =
    typeof usd.date === "string" && !Number.isNaN(Date.parse(usd.date)) ? usd.date : null;

  return { source: "nbg", gelPerUsd, effectiveDate, publishedAt };
}

/** Judges freshness at `now`, using Georgian business days rather than calendar days. */
export function assessRateFreshness(rate: ExchangeRate, now: Date): RateFreshness {
  const today = dateInTbilisi(now);
  const missedBusinessDays = countBusinessDaysAfter(rate.effectiveDate, today);
  return missedBusinessDays > MAX_BUSINESS_DAYS_WITHOUT_UPDATE ? "possibly-outdated" : "current";
}

/**
 * Converts an amount between USD and GEL with the given rate. Not rounded: callers round once,
 * for display, so filtering and display use the same value.
 */
export function convertAmount(
  amount: number,
  from: Currency,
  to: Currency,
  rate: ExchangeRate,
): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError("amount must be a finite number of at least 0.");
  }
  if (from === to) {
    return amount;
  }
  return from === "USD" ? amount * rate.gelPerUsd : amount / rate.gelPerUsd;
}

/** Rounds a converted price to whole currency units, the precision shown to users. */
export function roundToWholeUnits(amount: number): number {
  return Math.round(amount);
}
