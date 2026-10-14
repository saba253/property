import {
  type ComparableScope,
  type ComparableSelection,
  selectComparables,
} from "@/lib/analytics/comparables";
import type { ExchangeRateState } from "@/lib/currency/exchange-rate";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import { comparableMeasure, priceComparisonCurrency } from "@/lib/properties/listing-sort";
import { formatMoney } from "@/lib/pricing/format-money";
import { periodSuffix } from "@/lib/pricing/format-display-price";
import type { Currency, RentPeriod } from "@/lib/properties/types";

/*
 * Descriptive statistics of ASKING prices per m² of comparable listings (see comparables.ts).
 * This is not a valuation: asking prices are not transaction prices, and the result never says
 * that a price is cheap, expensive, fair or unfair.
 *
 * Values stay unrounded here; only the UI rounds. All prices of one comparison use one exchange
 * rate snapshot, and USD and GEL prices are never compared without a rate. With a real database
 * the median/min/max would come from an aggregate query (or a precomputed aggregate per city,
 * district, type and area band) instead of loading listings into the application.
 */

export type PriceStats = {
  currency: Currency;
  /** Subject's asking price per m² in `currency`. */
  subjectPerSqm: number;
  median: number;
  min: number;
  max: number;
  /** Number of comparables (the subject is not included). */
  count: number;
  /** (subject − median) / median × 100, unrounded. */
  differencePercent: number;
  /** True when at least one value was converted from its original currency (show "≈"). */
  isConverted: boolean;
  /** Each comparable's asking price per m², in the order of `comparables`. */
  values: number[];
};

export type AskingPriceContext =
  | {
      status: "ready";
      scope: ComparableScope;
      /** null for sale prices; "month" for monthly rent (price per m² per month). */
      period: RentPeriod | null;
      comparables: ListingWithProperty[];
      /** Statistics per display currency; null where that currency cannot be used honestly. */
      byCurrency: Record<Currency, PriceStats | null>;
    }
  | {
      /** Enough comparables, but USD and GEL prices cannot be compared without a rate. */
      status: "rate-unavailable";
      scope: ComparableScope;
      period: RentPeriod | null;
      count: number;
    }
  | {
      status: "insufficient";
      period: RentPeriod | null;
      districtCount: number;
      cityCount: number;
    }
  | { status: "invalid-subject" };

/** Mathematical median; does not modify `values`. Throws for an empty list. */
export function median(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError("median of an empty list");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Relative difference in percent; `reference` must be greater than zero. */
export function percentDifference(value: number, reference: number): number {
  if (!Number.isFinite(reference) || reference <= 0) {
    throw new RangeError("reference must be a finite number greater than 0.");
  }
  return ((value - reference) / reference) * 100;
}

/** Where `value` lies between `min` and `max`, as 0–100 (clamped), for the range bar. */
export function positionInRange(value: number, min: number, max: number): number {
  if (!(max > min)) return 50;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

/** Statistics in one currency, or null when a value cannot be expressed in it. */
function statsIn(
  currency: Currency,
  subject: ListingWithProperty,
  comparables: readonly ListingWithProperty[],
  rateState: ExchangeRateState,
): PriceStats | null {
  const all = [subject, ...comparables];
  // Without a rate only the listings' shared original currency can be used.
  if (rateState.status !== "available" && priceComparisonCurrency(all, rateState) !== currency) {
    return null;
  }
  const subjectPerSqm = comparableMeasure(subject, "price_per_sqm", currency, rateState);
  const values = comparables.map((item) =>
    comparableMeasure(item, "price_per_sqm", currency, rateState),
  );
  if (subjectPerSqm === null || values.some((value) => value === null)) return null;
  const numbers = values as number[];
  const mid = median(numbers);
  return {
    currency,
    subjectPerSqm,
    median: mid,
    min: Math.min(...numbers),
    max: Math.max(...numbers),
    count: numbers.length,
    differencePercent: percentDifference(subjectPerSqm, mid),
    isConverted: all.some((item) => item.listing.askingPrice.currency !== currency),
    values: numbers,
  };
}

/** Builds the context from a selection already made (so it is selected once per request). */
export function buildAskingPriceContext(
  subject: ListingWithProperty,
  selection: ComparableSelection,
  rateState: ExchangeRateState,
): AskingPriceContext {
  if (selection.status === "invalid-subject") return selection;
  const period = subject.listing.transactionType === "rent" ? subject.listing.rentPeriod : null;
  if (selection.status === "insufficient") {
    return {
      status: "insufficient",
      period,
      districtCount: selection.districtCount,
      cityCount: selection.cityCount,
    };
  }
  const { scope, comparables } = selection;
  const byCurrency: Record<Currency, PriceStats | null> = {
    USD: statsIn("USD", subject, comparables, rateState),
    GEL: statsIn("GEL", subject, comparables, rateState),
  };
  if (byCurrency.USD === null && byCurrency.GEL === null) {
    return { status: "rate-unavailable", scope, period, count: comparables.length };
  }
  return { status: "ready", scope, period, comparables, byCurrency };
}

/** Selects comparables and builds the context in one call. */
export function getAskingPriceContext(
  subject: ListingWithProperty,
  candidates: readonly ListingWithProperty[],
  rateState: ExchangeRateState,
): AskingPriceContext {
  return buildAskingPriceContext(subject, selectComparables(subject, candidates), rateState);
}

/**
 * A statistic per m² for display: whole units from 100 up, one decimal below (monthly rent per m²
 * is often a two-digit number). Example: "$2,308 / მ²", "$17.1 / მ² / თვე".
 */
export function formatStatPerSqm(
  value: number,
  currency: Currency,
  period: RentPeriod | null,
): string {
  return `${formatMoney(value, currency, value >= 100 ? 0 : 1)} / მ²${periodSuffix(period)}`;
}

/** Neutral description of the difference from the median, rounded to whole percent. */
export function describeDifference(differencePercent: number): string {
  const rounded = Math.round(differencePercent);
  if (rounded === 0) return "მედიანასთან ახლოსაა (სხვაობა 1%-ზე ნაკლებია)";
  return rounded > 0
    ? `მედიანაზე ${rounded}%-ით მაღალია`
    : `მედიანაზე ${Math.abs(rounded)}%-ით დაბალია`;
}
