import Link from "next/link";
import { ListingImageView, NoImagesPlaceholder } from "@/components/gallery/listing-image";
import { DemoBadge } from "@/components/properties/demo-label";
import { PricePerSqmChip } from "@/components/properties/price-per-sqm";
import type { DisplayPrice } from "@/lib/pricing/display-price";
import {
  formatDisplayAmount,
  formatDisplayPricePerSqm,
  originalPriceNote,
} from "@/lib/pricing/format-display-price";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import { PROPERTY_TYPES, TRANSACTION_TYPES } from "@/lib/properties/listing-types";
import { getCardFacts } from "@/lib/properties/property-facts";
import type { ListingImage } from "@/lib/properties/types";

type ListingCardProps = ListingWithProperty & {
  /** Must come from getListingDisplayPrice, so rental prices carry their monthly period. */
  price: DisplayPrice;
  href: string;
  /** Cover image (selectCoverImage), or null for the "no images" placeholder. */
  coverImage: ListingImage | null;
  imageCount: number;
};

export function ListingCard({
  listing,
  property,
  price,
  href,
  coverImage,
  imageCount,
}: ListingCardProps) {
  const pricePerSqm = formatDisplayPricePerSqm(price);
  const facts = getCardFacts(property);
  const imageBox =
    "aspect-[4/3] rounded-card shadow-card transition-shadow group-hover:shadow-card-hover";

  return (
    // Hover: soft image shadow and a faint cream background; no underline, scaling or layout shift
    // (negative margin offsets the padding). Keyboard focus uses the global focus outline.
    <Link
      href={href}
      className="group -m-2 block rounded-card p-2 transition-colors duration-150 hover:bg-cream/70"
    >
      <div className="relative">
        {/* Fixed aspect ratio box, so the card never shifts while the image renders. */}
        {coverImage ? (
          <ListingImageView image={coverImage} decorative className={imageBox} />
        ) : (
          <NoImagesPlaceholder compact className={imageBox} />
        )}
        <DemoBadge className="absolute top-3 left-3" />
        {imageCount > 1 && (
          <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-navy/75 px-2.5 py-1 text-xs font-semibold text-white">
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
              <path d="M7.4 3a1.5 1.5 0 0 0-1.3.8L5.4 5H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1.4l-.7-1.2a1.5 1.5 0 0 0-1.3-.8H7.4ZM10 7.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z" />
            </svg>
            <span className="sr-only">სურათები:</span>
            {imageCount}
          </span>
        )}
      </div>

      <div className="mt-3 px-1">
        <p className="text-xs font-semibold tracking-wide text-accent-700">
          {TRANSACTION_TYPES[listing.transactionType].label} · {PROPERTY_TYPES[property.type].label}
        </p>
        <h2 className="mt-0.5 text-base font-semibold text-navy">{listing.title}</h2>
        <p className="mt-0.5 text-sm text-muted">
          {property.city}, {property.district}
        </p>
        <p className="mt-0.5 text-sm text-muted">{facts.join(" · ")}</p>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-lg font-bold text-ink">{formatDisplayAmount(price)}</p>
          {pricePerSqm && <PricePerSqmChip text={pricePerSqm} />}
        </div>
        <p className="mt-0.5 text-xs text-subtle">{originalPriceNote(price)}</p>
      </div>
    </Link>
  );
}
