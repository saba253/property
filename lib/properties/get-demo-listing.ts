import { demoListings, demoProperties } from "@/lib/properties/demo-data";
import type { Listing, Property } from "@/lib/properties/types";

export type ListingWithProperty = {
  listing: Listing;
  property: Property;
};

export function getDemoListingWithProperty(listingId: string): ListingWithProperty | null {
  const listing = demoListings.find((item) => item.id === listingId);
  if (!listing) {
    return null;
  }

  const property = demoProperties.find((item) => item.id === listing.propertyId);
  if (!property) {
    return null;
  }

  return { listing, property };
}

export function getDemoListingIds(): string[] {
  return demoListings.map((listing) => listing.id);
}

/** Active demo listings with their properties, in data order. Listings without a property are skipped. */
export function getActiveDemoListingsWithProperties(): ListingWithProperty[] {
  return demoListings
    .filter((listing) => listing.status === "active")
    .map((listing) => getDemoListingWithProperty(listing.id))
    .filter((item): item is ListingWithProperty => item !== null);
}
