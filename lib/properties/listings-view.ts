import type { RawQuery } from "@/lib/properties/listing-filters";

/** How search results are shown: as a list (default) or as a list with a map. */
export type ListingsView = "list" | "map";

export const DEFAULT_LISTINGS_VIEW: ListingsView = "list";

/**
 * Reads `view` from the query. Missing, repeated-empty or unknown values fall back to the list,
 * so legacy URLs keep their behaviour; `invalid` tells the page to mention it.
 */
export function parseListingsView(query: RawQuery): { view: ListingsView; invalid: boolean } {
  const raw = query.view;
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();
  if (!value) return { view: DEFAULT_LISTINGS_VIEW, invalid: false };
  if (value === "map" || value === "list") return { view: value, invalid: false };
  return { view: DEFAULT_LISTINGS_VIEW, invalid: true };
}
