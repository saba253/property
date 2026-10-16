"use client";

import { useState } from "react";
import { RateNotice } from "@/components/currency/rate-notice";
import { ListingGallery } from "@/components/gallery/listing-gallery";
import { Segmented } from "@/components/listing-draft/draft-fields";
import { AmenityList } from "@/components/properties/amenity-list";
import { type Fact, FactList } from "@/components/properties/fact-list";
import { PricePerSqmCallout } from "@/components/properties/price-per-sqm";
import { card } from "@/components/ui/styles";
import type { ExchangeRateState } from "@/lib/currency/exchange-rate";
import { describeLocationPrecision } from "@/lib/geo/location";
import { DEFAULT_DISPLAY_CURRENCY } from "@/lib/currency/exchange-rate";
import type { DraftPhoto } from "@/lib/listing-draft/draft";
import { draftPhotosToImages } from "@/lib/listing-draft/draft-photos";
import { getListingDisplayPrice } from "@/lib/pricing/display-price";
import {
  formatDisplayAmount,
  formatDisplayPricePerSqm,
  originalPriceNote,
} from "@/lib/pricing/format-display-price";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import { PROPERTY_TYPES, TRANSACTION_TYPES } from "@/lib/properties/listing-types";
import { getStructuralFacts } from "@/lib/properties/property-facts";
import type { Currency } from "@/lib/properties/types";
import { PREVIEW_LABEL, type UserListingStatus } from "@/lib/review/statuses";

/** Corner label on draft photos in the gallery and photo viewer. */
export const LOCAL_PREVIEW_LABEL = "ლოკალური გადახედვა · არ არის ატვირთული";
/** Corner label on photos stored with a private draft. */
export const PRIVATE_PHOTO_LABEL = "პირადი ფოტო · არ არის გამოქვეყნებული";

type DraftPreviewProps = {
  item: ListingWithProperty;
  photos: readonly DraftPhoto[];
  rateState: ExchangeRateState;
  /** True when the photos are stored with the saved draft (not local previews). */
  storedPhotos?: boolean;
  /** Review status of a stored listing; the badge names it (a local draft is a "draft"). */
  status?: UserListingStatus;
};

/**
 * Preview of the unpublished local draft, laid out like a listing detail page and built from
 * the same components (gallery, facts, amenities, price per m²). It is clearly labelled as a
 * draft and offers no way to publish.
 */
export function DraftPreview({
  item,
  photos,
  rateState,
  storedPhotos = false,
  status = "draft",
}: DraftPreviewProps) {
  const [display, setDisplay] = useState<Currency>(DEFAULT_DISPLAY_CURRENCY);
  const { listing, property } = item;
  const price = getListingDisplayPrice(item, display, rateState);
  const pricePerSqm = formatDisplayPricePerSqm(price);
  const facts: Fact[] = [
    ...getStructuralFacts(property),
    { label: "ორიგინალი ვალუტა", value: listing.askingPrice.currency },
  ];

  return (
    <article aria-labelledby="draft-preview-title">
      <ListingGallery
        images={draftPhotosToImages(photos)}
        title={listing.title}
        photoLabel={storedPhotos ? PRIVATE_PHOTO_LABEL : LOCAL_PREVIEW_LABEL}
      />

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-300">
              {PREVIEW_LABEL[status]}
            </span>
            <span className="inline-flex items-center rounded-full bg-navy px-2.5 py-1 text-xs font-semibold text-white">
              {TRANSACTION_TYPES[listing.transactionType].label}
            </span>
            <span className="inline-flex items-center rounded-full bg-cream px-2.5 py-1 text-xs font-semibold text-navy ring-1 ring-line">
              {PROPERTY_TYPES[property.type].label}
            </span>
          </div>
          <h3
            id="draft-preview-title"
            className="mt-3 text-2xl font-bold tracking-tight text-navy sm:text-3xl"
          >
            {listing.title}
          </h3>
          <p className="mt-2 text-lg text-muted">
            {property.city}, {property.district}
          </p>
          <p className="mt-1 text-sm text-muted">
            {describeLocationPrecision(property.location?.precision ?? "unknown")}
          </p>

          <section aria-labelledby="draft-facts-heading" className="mt-8">
            <h4 id="draft-facts-heading" className="text-xl font-semibold text-navy">
              ქონების მონაცემები
            </h4>
            <div className="mt-4">
              <FactList facts={facts} />
            </div>
          </section>

          <section aria-labelledby="draft-amenities-heading" className="mt-10">
            <h4 id="draft-amenities-heading" className="text-xl font-semibold text-navy">
              კეთილმოწყობა
            </h4>
            <div className="mt-4">
              <AmenityList item={item} />
            </div>
          </section>
        </div>

        <aside aria-label="ფასის შეჯამება" className="lg:sticky lg:top-24 lg:self-start">
          <div className={`${card} p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted">
                {price.period === null ? "მითითებული ფასი" : "თვიური ქირა"}
              </p>
              <Segmented<Currency>
                legend="ჩვენების ვალუტა"
                hideLegend
                name="draft-display-currency"
                options={[
                  { value: "USD", label: "$ USD" },
                  { value: "GEL", label: "₾ GEL" },
                ]}
                value={display}
                onChange={setDisplay}
              />
            </div>
            <p className="mt-2 text-3xl font-bold text-ink">{formatDisplayAmount(price)}</p>
            <p className="mt-1 text-xs text-subtle">{originalPriceNote(price)}</p>
            {pricePerSqm && (
              <div className="mt-5">
                <PricePerSqmCallout
                  title={
                    price.period === null
                      ? "მითითებული ფასი კვადრატულ მეტრზე"
                      : "თვიური ქირა კვადრატულ მეტრზე"
                  }
                  text={pricePerSqm}
                  note={
                    price.isConverted
                      ? "ავტომატურად გამოითვლება · სავარაუდო, ოფიციალური კურსით"
                      : "ავტომატურად გამოითვლება"
                  }
                />
              </div>
            )}
          </div>
          <div className="mt-4">
            <RateNotice rateState={rateState} />
          </div>
        </aside>
      </div>
    </article>
  );
}
