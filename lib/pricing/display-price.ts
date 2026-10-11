import {
  type ExchangeRateState,
  convertAmount,
  roundToWholeUnits,
} from "@/lib/currency/exchange-rate";
import { calculateAskingPricePerSqm } from "@/lib/pricing/price-per-sqm";
import type { Currency, Money } from "@/lib/properties/types";

/**
 * A listing's price as shown to the user in the chosen display currency.
 *
 * The original asking price is always kept. `amount` is null when the listing is in another
 * currency and no exchange rate is available, so it cannot be shown or compared.
 */
export type DisplayPrice = {
  original: Money;
  currency: Currency;
  /** Whole units in `currency`; converted prices are rounded once, here. */
  amount: number | null;
  /** Asking price per m² in `currency`, from `amount`, rounded to 2 decimals. */
  pricePerSqm: number | null;
  /** True when `amount` was converted from another currency and is approximate. */
  isConverted: boolean;
};

/**
 * Builds the display price for one listing. Filtering compares the same `amount`, so a price a
 * user sees always agrees with whether the listing matched their budget.
 */
export function getDisplayPrice(
  original: Money,
  areaSqm: number,
  currency: Currency,
  rateState: ExchangeRateState,
): DisplayPrice {
  if (original.currency === currency) {
    return {
      original,
      currency,
      amount: original.amount,
      pricePerSqm: calculateAskingPricePerSqm(original.amount, areaSqm),
      isConverted: false,
    };
  }

  if (rateState.status !== "available") {
    return { original, currency, amount: null, pricePerSqm: null, isConverted: false };
  }

  const amount = roundToWholeUnits(
    convertAmount(original.amount, original.currency, currency, rateState.rate),
  );
  return {
    original,
    currency,
    amount,
    pricePerSqm: amount > 0 ? calculateAskingPricePerSqm(amount, areaSqm) : null,
    isConverted: true,
  };
}
