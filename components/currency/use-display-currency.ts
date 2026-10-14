"use client";

import { useSearchParams } from "next/navigation";
import { parseDisplayCurrency } from "@/lib/properties/listing-filters";
import type { Currency } from "@/lib/properties/types";

/** The display currency from ?display= (USD by default). Needs a <Suspense> boundary above it. */
export function useDisplayCurrency(): Currency {
  const value = useSearchParams().get("display");
  return parseDisplayCurrency(value ? { display: value } : {}).display;
}
