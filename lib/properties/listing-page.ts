import type { RawQuery } from "@/lib/properties/listing-filters";
import { MAX_PAGE_OFFSET } from "@/lib/repository/listing-repository";

/** Results per page on /properties (fits the 1, 2 and 3 column grids). */
export const PAGE_SIZE = 12;

/** Highest page that can be requested (the repository refuses deeper offsets). */
export const MAX_PAGE = Math.floor(MAX_PAGE_OFFSET / PAGE_SIZE) + 1;

/**
 * Reads `page` from the query. Missing means page 1. Anything that is not a whole number from 1
 * to MAX_PAGE (0, -2, 1.5, "abc", 99999) also gives page 1, with `invalid` set so the page can
 * say so. Whether the page exists for the current results is checked after the search.
 */
export function parsePage(query: RawQuery): { page: number; invalid: boolean } {
  const raw = query.page;
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (!value) return { page: 1, invalid: false };
  if (!/^\d{1,6}$/.test(value)) return { page: 1, invalid: true };
  const page = Number(value);
  return page >= 1 && page <= MAX_PAGE ? { page, invalid: false } : { page: 1, invalid: true };
}

/** Repository page request for a 1-based page number. */
export function pageRequest(page: number) {
  return { offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE };
}

/** Number of pages when the total is exact; null when only a lower bound is known. */
export function lastPageOf(total: number, totalIsExact: boolean): number | null {
  if (!totalIsExact) return null;
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

/**
 * Page numbers to show: the first, the last (when known), and the current one with its
 * neighbours; null marks a gap ("…"). Example for 7 of 20: [1, null, 6, 7, 8, null, 20].
 */
export function pageNumbers(current: number, lastPage: number | null): (number | null)[] {
  const last = lastPage ?? current + 1;
  const wanted = new Set([1, current - 1, current, current + 1, last]);
  const pages = [...wanted].filter((page) => page >= 1 && page <= last).sort((a, b) => a - b);
  const result: (number | null)[] = [];
  for (const page of pages) {
    if (result.length > 0 && page - (result[result.length - 1] as number) > 1) result.push(null);
    result.push(page);
  }
  return lastPage === null ? result.filter((page) => page === null || page <= current) : result;
}
