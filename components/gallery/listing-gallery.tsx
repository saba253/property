"use client";

import { useState } from "react";
import { ListingImageView, NoImagesPlaceholder } from "@/components/gallery/listing-image";
import { PhotoViewer } from "@/components/gallery/photo-viewer";
import { formatImageCount, formatImagePosition } from "@/lib/properties/listing-images";
import type { ListingImage } from "@/lib/properties/types";

/** Thumbnails shown next to the main image on larger screens; the rest are in the viewer. */
const SIDE_THUMBNAILS = 2;

type ListingGalleryProps = {
  /** Images in gallery order (cover first), for example from getImagesForListing. */
  images: readonly ListingImage[];
  /** Listing title, used in accessible names. */
  title: string;
  /** Corner label for photos (for example "local preview"); illustrations are always labelled. */
  photoLabel?: string;
};

function GalleryIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-current">
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.5" />
      <rect x="11" y="11" width="6" height="6" rx="1.5" />
    </svg>
  );
}

/**
 * Detail page gallery: a large main image with supporting thumbnails (beside it on larger
 * screens, in a scrollable row on phones) and a button showing the image count. Any image opens
 * the full-screen PhotoViewer at that image. Without images a clear placeholder is shown.
 */
export function ListingGallery({ images, title, photoLabel }: ListingGalleryProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const total = images.length;

  if (total === 0) {
    return <NoImagesPlaceholder className="aspect-[4/3] rounded-card sm:aspect-[21/9]" />;
  }

  const [primary, ...rest] = images;
  const side = rest.slice(0, SIDE_THUMBNAILS);
  const hiddenCount = total - 1 - side.length;
  const enlargeLabel = (image: ListingImage, index: number) =>
    `სურათის გადიდება: ${image.caption ?? image.alt} (${formatImagePosition(index, total)})`;
  const tile = "group/tile relative block h-full w-full overflow-hidden";
  const tileImage = "h-full w-full transition-[filter] duration-150 group-hover/tile:brightness-95";

  return (
    <div>
      <div className="relative">
        <div
          className={`grid gap-2 overflow-hidden rounded-card ${
            total > 1 ? "sm:aspect-[21/9] sm:grid-cols-3 sm:grid-rows-2" : "sm:aspect-[21/9]"
          }`}
        >
          <button
            type="button"
            onClick={() => setViewerIndex(0)}
            aria-label={enlargeLabel(primary, 0)}
            className={`${tile} aspect-[4/3] sm:aspect-auto ${total > 1 ? "sm:col-span-2 sm:row-span-2" : ""}`}
          >
            <ListingImageView
              image={primary}
              label={photoLabel}
              labelPlacement="top"
              className={tileImage}
            />
          </button>
          {side.map((image, sideIndex) => {
            const index = sideIndex + 1;
            const isLast = sideIndex === side.length - 1;
            return (
              <button
                key={image.id}
                type="button"
                onClick={() => setViewerIndex(index)}
                aria-label={enlargeLabel(image, index)}
                className={`${tile} hidden sm:block ${side.length === 1 ? "sm:row-span-2" : ""}`}
              >
                <ListingImageView image={image} label={null} className={tileImage} />
                {isLast && hiddenCount > 0 && (
                  <span className="absolute inset-0 flex items-center justify-center bg-navy/55 text-lg font-semibold text-white">
                    +{hiddenCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setViewerIndex(0)}
          className="absolute bottom-3 left-3 inline-flex h-9 items-center gap-2 rounded-full bg-white/95 px-3.5 text-sm font-semibold text-navy shadow-card transition-colors hover:bg-white"
        >
          <GalleryIcon />
          {total > 1 ? `ყველა სურათი · ${total}` : formatImageCount(total)}
        </button>
      </div>

      {total > 1 && (
        <ul
          aria-label="სურათები"
          className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] sm:hidden"
        >
          {rest.map((image, restIndex) => (
            <li key={image.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setViewerIndex(restIndex + 1)}
                aria-label={enlargeLabel(image, restIndex + 1)}
                className="block overflow-hidden rounded-xl"
              >
                <ListingImageView image={image} label={null} className="h-16 w-24" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <PhotoViewer
        images={images}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        onClose={() => setViewerIndex(null)}
        title={title}
        photoLabel={photoLabel}
      />
    </div>
  );
}
