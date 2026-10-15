import "server-only";
import { cacheLife } from "next/cache";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import type {
  ListingCount,
  ListingSearchQuery,
  ListingSearchResult,
} from "@/lib/repository/listing-repository";
import { getListingRepository } from "@/lib/repository/select-repository";

/*
 * Server-side listing reads for pages. Like lib/currency/get-exchange-rate.ts, this file depends
 * on Next.js; the logic is in the tested repository. Reads used by prerendered pages are cached
 * ("use cache", "hours" like the exchange rate), so a database is not queried on every request
 * and static pages stay static. Searches depend on the query and run per request (inside the
 * page's <Suspense>), without caching. Database errors are thrown (never replaced by demo data).
 */

export async function getListing(id: string) {
  "use cache";
  cacheLife("hours");
  return (await getListingRepository()).getListingById(id);
}

export async function getListingIds() {
  "use cache";
  cacheLife("hours");
  return (await getListingRepository()).getListingIds();
}

export async function getActiveListings() {
  "use cache";
  cacheLife("hours");
  return (await getListingRepository()).getActiveListings();
}

export async function getSearchFacets() {
  "use cache";
  cacheLife("hours");
  return (await getListingRepository()).getSearchFacets();
}

export async function getListingImages(listingId: string) {
  "use cache";
  cacheLife("hours");
  return (await getListingRepository()).getListingImages(listingId);
}

export async function getListingCovers(listingIds: readonly string[]) {
  "use cache";
  cacheLife("hours");
  return (await getListingRepository()).getListingCovers(listingIds);
}

export async function findComparableCandidates(subject: ListingWithProperty) {
  "use cache";
  cacheLife("hours");
  return (await getListingRepository()).findComparableCandidates(subject);
}

/** The first sale listings in default order (homepage). A paged query, not the whole catalog. */
export async function getFeaturedSaleListings(limit: number) {
  "use cache";
  cacheLife("hours");
  const repository = await getListingRepository();
  // No budget or price sort, so no exchange rate is involved.
  const { items } = await repository.searchListings({
    filters: {},
    display: "USD",
    rateState: { status: "unavailable" },
    sort: "default",
    page: { offset: 0, limit },
  });
  return items;
}

export async function searchListings(query: ListingSearchQuery): Promise<ListingSearchResult> {
  return (await getListingRepository()).searchListings(query);
}

export async function countListings(
  query: Omit<ListingSearchQuery, "sort" | "page">,
): Promise<ListingCount> {
  return (await getListingRepository()).countListings(query);
}
