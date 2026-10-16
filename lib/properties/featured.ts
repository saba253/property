import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import type { ListingRepository } from "@/lib/repository/listing-repository";

/*
 * Deterministic featured selection for the homepage. There is no popularity data yet (and none
 * is invented), so "featured" means: public listings of one city in the catalog's default order,
 * alternating sale and rent so both kinds are shown, up to `limit`. The same data always gives
 * the same selection.
 */

export const FEATURED_CITY_SLUG = "tbilisi";
export const FEATURED_LIMIT = 8;

/** Alternates sale and rent listings (sale first), keeping each list's order, up to `limit`. */
export function interleaveFeatured(
  sale: readonly ListingWithProperty[],
  rent: readonly ListingWithProperty[],
  limit: number,
): ListingWithProperty[] {
  const result: ListingWithProperty[] = [];
  const seen = new Set<string>();
  for (let i = 0; result.length < limit && (i < sale.length || i < rent.length); i += 1) {
    for (const item of [sale[i], rent[i]]) {
      if (item && !seen.has(item.listing.id) && result.length < limit) {
        seen.add(item.listing.id);
        result.push(item);
      }
    }
  }
  return result;
}

/**
 * The featured listings of one city from a repository: one page of public sale listings and one
 * of public rentals (the repository's search only returns public listings), interleaved.
 */
export async function selectFeaturedListings(
  repository: Pick<ListingRepository, "searchListings">,
  citySlug: string,
  limit: number,
): Promise<ListingWithProperty[]> {
  const page = (transaction: "sale" | "rent") =>
    repository.searchListings({
      filters: { citySlug, transaction },
      display: "USD",
      rateState: { status: "unavailable" },
      sort: "default",
      page: { offset: 0, limit },
    });
  const [sale, rent] = await Promise.all([page("sale"), page("rent")]);
  return interleaveFeatured(sale.items, rent.items, limit);
}
