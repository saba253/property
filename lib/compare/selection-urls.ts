import { MAX_COMPARE } from "@/lib/compare/compare-selection";
import { MAX_FAVORITES } from "@/lib/favorites/favorites";
import { DEFAULT_DISPLAY_CURRENCY } from "@/lib/currency/exchange-rate";
import type { Currency } from "@/lib/properties/types";

/*
 * URLs of the favorites and comparison pages. The ids saved in this browser travel as `ids=a,b`
 * so the server renders only those listings (never the whole catalog). Browser storage stays the
 * source of truth: the page replaces the URL when storage changes and never saves URL ids.
 */

function pageHref(path: string, ids: readonly string[], max: number, display: Currency) {
  const params = new URLSearchParams();
  if (display !== DEFAULT_DISPLAY_CURRENCY) params.set("display", display);
  if (ids.length > 0) params.set("ids", ids.slice(0, max).join(","));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function buildComparePageHref(
  ids: readonly string[],
  display: Currency = DEFAULT_DISPLAY_CURRENCY,
) {
  return pageHref("/compare", ids, MAX_COMPARE, display);
}

export function buildFavoritesPageHref(
  ids: readonly string[],
  display: Currency = DEFAULT_DISPLAY_CURRENCY,
) {
  return pageHref("/favorites", ids, MAX_FAVORITES, display);
}
