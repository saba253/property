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

/**
 * Example: formatMoney(150000, "USD") returns "$150,000". Shown in whole units unless
 * `maxFractionDigits` allows decimals (formatMoney(17.14, "USD", 1) returns "$17.1").
 */
export function formatMoney(amount: number, currency: Currency, maxFractionDigits = 0): string {
  return `${CURRENCY_SYMBOLS[currency]}${formatNumber(amount, 0, maxFractionDigits)}`;
}

/** Example: formatPricePerSqm(2307.69, "USD") returns "$2,307.69 / მ²". */
export function formatPricePerSqm(pricePerSqm: number, currency: Currency): string {
  return `${CURRENCY_SYMBOLS[currency]}${formatNumber(pricePerSqm, 2, 2)} / მ²`;
}

/** Example: formatExchangeRate(2.6005) returns "1 USD = 2.6005 GEL" (NBG publishes 4 decimals). */
export function formatExchangeRate(gelPerUsd: number): string {
  return `1 USD = ${formatNumber(gelPerUsd, 4, 4)} GEL`;
}

/** Example: formatDateGeorgian("2026-10-10") returns "10.10.2026", the usual Georgian format. */
export function formatDateGeorgian(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

/** Example: formatArea(48.5) returns "48.5 მ²". */
export function formatArea(areaSqm: number): string {
  return `${formatNumber(areaSqm, 0, 2)} მ²`;
}
