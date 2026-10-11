import type { Currency } from "@/lib/properties/types";

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: "$",
  GEL: "₾",
};

function formatNumber(value: number, minFractionDigits: number, maxFractionDigits: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}

/** Example: formatMoney(150000, "USD") returns "$150,000". Shown in whole units. */
export function formatMoney(amount: number, currency: Currency): string {
  return `${CURRENCY_SYMBOLS[currency]}${formatNumber(amount, 0, 0)}`;
}

/** Example: formatPricePerSqm(2307.69, "USD") returns "$2,307.69 / მ²". */
export function formatPricePerSqm(pricePerSqm: number, currency: Currency): string {
  return `${CURRENCY_SYMBOLS[currency]}${formatNumber(pricePerSqm, 2, 2)} / მ²`;
}

/** Example: formatArea(48.5) returns "48.5 მ²". */
export function formatArea(areaSqm: number): string {
  return `${formatNumber(areaSqm, 0, 2)} მ²`;
}
