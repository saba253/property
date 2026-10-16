import "server-only";
import { cacheLife } from "next/cache";
import { connection } from "next/server";
import { selectFeaturedListings } from "@/lib/properties/featured";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import type {
  ListingCount,
  ListingSearchQuery,
  ListingSearchResult,
} from "@/lib/repository/listing-repository";
import { resolveDataBackend } from "@/lib/db/config";
import { getListingRepository } from "@/lib/repository/select-repository";

/**
 * Cache lifetime of listing reads. Demo data only changes with a deploy ("hours", like the
 * exchange rate). Database data can change status at any time, so it is cached only for
 * minutes, which keeps an ended listing from appearing as active for long.
 */
function listingCacheLife() {
  let backend = "memory";
  try {
    backend = resolveDataBackend(process.env).backend;
  } catch {
    // A configuration error surfaces from getListingRepository; caching does not hide it.
  }
  if (backend === "postgres") cacheLife("minutes");
  else cacheLife("hours");
}

/*
 * Server-side listing reads for pages. Like lib/currency/get-exchange-rate.ts, this file depends
 * on Next.js; the logic is in the tested repository. Reads used by prerendered pages are cached
 * ("use cache"; see listingCacheLife), so a database is not queried on every request
 * and static pages stay static. Searches depend on the query and run per request (inside the
 * page's <Suspense>), without caching. Database errors are thrown (never replaced by demo data).
 *
 * The uncached reads start with `await connection()`: they always belong to a request. Opening a
 * PostgreSQL connection uses randomness (the SCRAM password exchange), which Next.js does not
 * allow while it prerenders or validates a runtime prefetch.
 */

export async function getListing(id: string) {
  "use cache";
  listingCacheLife();
  return (await getListingRepository()).getListingById(id);
}

export async function getListingIds() {
  "use cache";
  listingCacheLife();
  return (await getListingRepository()).getListingIds();
}

export async function getActiveListings() {
  "use cache";
  listingCacheLife();
  return (await getListingRepository()).getActiveListings();
}

export async function getSearchFacets() {
  "use cache";
  listingCacheLife();
  return (await getListingRepository()).getSearchFacets();
}

export async function getListingImages(listingId: string) {
  "use cache";
  listingCacheLife();
  return (await getListingRepository()).getListingImages(listingId);
}

export async function getListingCovers(listingIds: readonly string[]) {
  "use cache";
  listingCacheLife();
  return (await getListingRepository()).getListingCovers(listingIds);
}

export async function findComparableCandidates(subject: ListingWithProperty) {
  "use cache";
  listingCacheLife();
  return (await getListingRepository()).findComparableCandidates(subject);
}

/**
 * Featured public listings of one city for the homepage carousel: sale and rent alternating in
 * the default catalog order (lib/properties/featured.ts), at most `limit`. Two paged queries,
 * public listings only (the repository's public statuses and data sources).
 */
export async function getFeaturedCityListings(citySlug: string, limit: number) {
  "use cache";
  listingCacheLife();
  return selectFeaturedListings(await getListingRepository(), citySlug, limit);
}

/**
 * Listings for a set of ids (favorites, comparison), one batch query. Not cached: the id sets are
 * chosen by visitors, so caching them would let anyone fill the cache.
 */
export async function getListingsByIds(ids: readonly string[]) {
  await connection();
  return (await getListingRepository()).getListingsByIds(ids);
}

/** Covers for a batch of ids, without caching (see getListingsByIds). */
export async function getListingCoversUncached(listingIds: readonly string[]) {
  await connection();
  return (await getListingRepository()).getListingCovers(listingIds);
}

export async function searchListings(query: ListingSearchQuery): Promise<ListingSearchResult> {
  await connection();
  return (await getListingRepository()).searchListings(query);
}

export async function countListings(
  query: Omit<ListingSearchQuery, "sort" | "page">,
): Promise<ListingCount> {
  await connection();
  return (await getListingRepository()).countListings(query);
}
