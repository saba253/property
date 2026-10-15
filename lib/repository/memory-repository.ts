import { getDistrictsPresentIn } from "@/lib/properties/cities";
import { demoListings, demoProperties } from "@/lib/properties/demo-data";
import { demoListingImages } from "@/lib/properties/demo-images";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import { filterListings } from "@/lib/properties/listing-filters";
import { getImagesForListing, selectCoverImage } from "@/lib/properties/listing-images";
import { sortListings } from "@/lib/properties/listing-sort";
import type { Listing, ListingImage, Property } from "@/lib/properties/types";
import {
  type ListingCover,
  type ListingRepository,
  PUBLIC_LISTING_STATUSES,
  normalizePage,
} from "@/lib/repository/listing-repository";

export type MemoryDataset = {
  properties: readonly Property[];
  listings: readonly Listing[];
  images: readonly ListingImage[];
};

/** The demo dataset (invented examples; see lib/properties/demo-data.ts). */
export const DEMO_DATASET: MemoryDataset = {
  properties: demoProperties,
  listings: demoListings,
  images: demoListingImages,
};

/**
 * Repository over in-memory data, in data order. Filtering and sorting reuse the tested
 * functions the pages used before (filterListings, sortListings), so results are unchanged.
 */
export function createMemoryRepository(dataset: MemoryDataset = DEMO_DATASET): ListingRepository {
  const propertyById = new Map(dataset.properties.map((property) => [property.id, property]));
  const isPublic = (listing: Listing) =>
    (PUBLIC_LISTING_STATUSES as readonly string[]).includes(listing.status);
  const withProperty = (listing: Listing): ListingWithProperty | null => {
    const property = propertyById.get(listing.propertyId);
    return property ? { listing, property } : null;
  };
  const publicItems = dataset.listings
    .filter(isPublic)
    .map(withProperty)
    .filter((item): item is ListingWithProperty => item !== null);
  const activeItems = publicItems.filter((item) => item.listing.status === "active");

  const imagesOf = (listingId: string) => getImagesForListing(listingId, dataset.images);

  return {
    backend: "memory",
    async getListingById(id) {
      return publicItems.find((item) => item.listing.id === id) ?? null;
    },
    async getListingIds() {
      return publicItems.map((item) => item.listing.id);
    },
    async getActiveListings() {
      return [...activeItems];
    },
    async getSearchFacets() {
      return {
        cityNames: [...new Set(activeItems.map((item) => item.property.city))],
        districts: getDistrictsPresentIn(activeItems.map((item) => item.property)),
        totals: {
          sale: activeItems.filter((item) => item.listing.transactionType === "sale").length,
          rent: activeItems.filter((item) => item.listing.transactionType === "rent").length,
        },
      };
    },
    async countListings({ filters, display, rateState }) {
      const { matches, notComparableCount } = filterListings(
        activeItems,
        filters,
        display,
        rateState,
      );
      return { total: matches.length, notComparableCount };
    },
    async searchListings({ filters, display, rateState, sort, page }) {
      const { matches, notComparableCount } = filterListings(
        activeItems,
        filters,
        display,
        rateState,
      );
      const sorted = sortListings(matches, sort, rateState);
      const bounds = normalizePage(page);
      return {
        items: sorted.items.slice(bounds.offset, bounds.offset + bounds.limit),
        total: matches.length,
        notComparableCount,
        page: bounds,
        sortApplied: sorted.applied,
        sortNotice: sorted.notice,
      };
    },
    async getListingImages(listingId) {
      return imagesOf(listingId);
    },
    async getListingCovers(listingIds) {
      const covers: Record<string, ListingCover> = {};
      for (const id of listingIds) {
        const images = imagesOf(id);
        covers[id] = { coverImage: selectCoverImage(images), imageCount: images.length };
      }
      return covers;
    },
    async findComparableCandidates() {
      // Every active listing; selectComparables applies the rules. Fine for demo-sized data.
      return [...activeItems];
    },
  };
}
