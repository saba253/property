"use client";

import type { ReactNode } from "react";
import { useDisplayCurrency } from "@/components/currency/use-display-currency";
import type { Currency } from "@/lib/properties/types";

/**
 * Shows the variant for the current display currency. The variants are rendered on the server
 * (static pages cannot read ?display=), so only this tiny switch runs in the browser.
 */
export function DisplayCurrencySwitch({ variants }: { variants: Record<Currency, ReactNode> }) {
  return variants[useDisplayCurrency()];
}
