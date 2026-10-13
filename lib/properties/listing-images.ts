import type { ListingImage } from "@/lib/properties/types";

/** Most images one listing may have (demo data and the draft listing form share this limit). */
export const MAX_LISTING_IMAGES = 12;

/** Images sorted by `order`, ties broken by `id`, so the order never depends on input order. */
export function sortImagesByOrder(images: readonly ListingImage[]): ListingImage[] {
  return [...images].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The cover image: the image marked `isCover` (the first by order if several are marked by
 * mistake), otherwise the first image by order. null when there are no images.
 */
export function selectCoverImage(images: readonly ListingImage[]): ListingImage | null {
  const sorted = sortImagesByOrder(images);
  return sorted.find((image) => image.isCover) ?? sorted[0] ?? null;
}

/** Gallery order: the cover first, then the remaining images by order. */
export function getGalleryOrder(images: readonly ListingImage[]): ListingImage[] {
  const cover = selectCoverImage(images);
  if (!cover) {
    return [];
  }
  return [cover, ...sortImagesByOrder(images).filter((image) => image !== cover)];
}

/** One listing's images in gallery order, from a collection of images of many listings. */
export function getImagesForListing(
  listingId: string,
  allImages: readonly ListingImage[],
): ListingImage[] {
  return getGalleryOrder(allImages.filter((image) => image.listingId === listingId));
}

export type ListingImageIssue =
  | { code: "duplicate-id"; imageId: string }
  | { code: "missing-alt"; imageId: string }
  | { code: "invalid-order"; imageId: string }
  | { code: "multiple-covers"; listingId: string }
  | { code: "too-many-images"; listingId: string }
  | { code: "unknown-listing"; imageId: string };

/**
 * Data checks for an image collection: unique ids, descriptive alt text, valid order values,
 * at most one cover and at most MAX_LISTING_IMAGES per listing, and (when `listingIds` is
 * given) that every image belongs to an existing listing.
 */
export function findListingImageIssues(
  images: readonly ListingImage[],
  listingIds?: readonly string[],
): ListingImageIssue[] {
  const issues: ListingImageIssue[] = [];
  const seenIds = new Set<string>();
  const knownListings = listingIds ? new Set(listingIds) : null;
  const perListing = new Map<string, ListingImage[]>();

  for (const image of images) {
    if (seenIds.has(image.id)) issues.push({ code: "duplicate-id", imageId: image.id });
    seenIds.add(image.id);
    if (image.alt.trim() === "") issues.push({ code: "missing-alt", imageId: image.id });
    if (!Number.isInteger(image.order) || image.order < 0) {
      issues.push({ code: "invalid-order", imageId: image.id });
    }
    if (knownListings && !knownListings.has(image.listingId)) {
      issues.push({ code: "unknown-listing", imageId: image.id });
    }
    perListing.set(image.listingId, [...(perListing.get(image.listingId) ?? []), image]);
  }

  for (const [listingId, listingImages] of perListing) {
    if (listingImages.filter((image) => image.isCover).length > 1) {
      issues.push({ code: "multiple-covers", listingId });
    }
    if (listingImages.length > MAX_LISTING_IMAGES) {
      issues.push({ code: "too-many-images", listingId });
    }
  }
  return issues;
}

/** Previous/next navigation that wraps around: from the last image "next" goes to the first. */
export function stepImageIndex(current: number, delta: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return (((current + delta) % total) + total) % total;
}

/** "2 / 6": the position of the shown image (0-based index) and the total. */
export function formatImagePosition(index: number, total: number): string {
  return `${index + 1} / ${total}`;
}

/** "6 სურათი", or a clear message when a listing has no images. */
export function formatImageCount(total: number): string {
  return total === 0 ? "სურათები არ არის დამატებული" : `${total} სურათი`;
}

/** True for original illustrations, which must always be labelled as not being real photos. */
export function isIllustration(image: ListingImage): boolean {
  return image.source.kind === "illustration";
}
