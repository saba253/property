import type { DisplayPrice } from "@/lib/pricing/display-price";
import { formatMoney, formatPricePerSqm } from "@/lib/pricing/format-money";

/** Text helpers for a DisplayPrice. Main price in the display currency ("≈" when converted), or the original if not convertible. */
export function formatDisplayAmount(price: DisplayPrice): string {
  if (price.amount === null) {
    return formatMoney(price.original.amount, price.original.currency);
  }
  const text = formatMoney(price.amount, price.currency);
  return price.isConverted ? `≈ ${text}` : text;
}

/** Price per m² in the display currency, or null if it cannot be shown. */
export function formatDisplayPricePerSqm(price: DisplayPrice): string | null {
  if (price.pricePerSqm === null) {
    return null;
  }
  const text = formatPricePerSqm(price.pricePerSqm, price.currency);
  return price.isConverted ? `≈ ${text}` : text;
}

/** One-line explanation of the original price under a displayed price. */
export function originalPriceNote(price: DisplayPrice): string {
  const original = formatMoney(price.original.amount, price.original.currency);
  if (price.amount === null) {
    return `ორიგინალი ფასი (${price.original.currency}). ${price.currency}-ში გადაყვანა ამჟამად მიუწვდომელია.`;
  }
  if (price.isConverted) {
    return `ორიგინალი ფასი: ${original} (${price.original.currency})`;
  }
  return `ორიგინალი ფასი ${price.original.currency}-ში`;
}
