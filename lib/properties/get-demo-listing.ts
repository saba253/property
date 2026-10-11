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
