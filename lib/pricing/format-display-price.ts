import type { DisplayPrice } from "@/lib/pricing/display-price";
import { formatMoney, formatPricePerSqm } from "@/lib/pricing/format-money";
import type { RentPeriod } from "@/lib/properties/types";

const PERIOD_SUFFIX: Record<RentPeriod, string> = {
  month: " / თვე",
};

/** " / თვე" for monthly rent, "" for a sale price. */
export function periodSuffix(period: RentPeriod | null): string {
  return period === null ? "" : PERIOD_SUFFIX[period];
}

/**
 * Main price in the display currency ("≈" when converted), or the original if not convertible.
 * Rental prices always carry their period, for example "≈ $462 / თვე".
 */
export function formatDisplayAmount(price: DisplayPrice): string {
  const suffix = periodSuffix(price.period);
  if (price.amount === null) {
    return `${formatMoney(price.original.amount, price.original.currency)}${suffix}`;
  }
  const text = `${formatMoney(price.amount, price.currency)}${suffix}`;
  return price.isConverted ? `≈ ${text}` : text;
}

/** Price per m² in the display currency (with period for rent), or null if it cannot be shown. */
export function formatDisplayPricePerSqm(price: DisplayPrice): string | null {
  if (price.pricePerSqm === null) {
    return null;
  }
  const text = `${formatPricePerSqm(price.pricePerSqm, price.currency)}${periodSuffix(price.period)}`;
  return price.isConverted ? `≈ ${text}` : text;
}

/** One-line explanation of the original price under a displayed price. */
export function originalPriceNote(price: DisplayPrice): string {
  const label = price.period === null ? "ორიგინალი ფასი" : "ორიგინალი ქირა";
  const original = `${formatMoney(price.original.amount, price.original.currency)}${periodSuffix(price.period)}`;
  if (price.amount === null) {
    return `${label} (${price.original.currency}). ${price.currency}-ში გადაყვანა ამჟამად მიუწვდომელია.`;
  }
  if (price.isConverted) {
    return `${label}: ${original} (${price.original.currency})`;
  }
  return `${label} ${price.original.currency}-ში`;
}
