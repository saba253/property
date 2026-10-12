import Link from "next/link";
import { DemoBadge } from "@/components/properties/demo-label";
import { PricePerSqmChip } from "@/components/properties/price-per-sqm";
import { PropertyIllustration } from "@/components/properties/property-illustration";
import type { DisplayPrice } from "@/lib/pricing/display-price";
import {
  formatDisplayAmount,
  formatDisplayPricePerSqm,
  originalPriceNote,
} from "@/lib/pricing/format-display-price";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import { PROPERTY_TYPES, TRANSACTION_TYPES } from "@/lib/properties/listing-types";
import { getCardFacts } from "@/lib/properties/property-facts";

type ListingCardProps = ListingWithProperty & {
  /** Must come from getListingDisplayPrice, so rental prices carry their monthly period. */
  price: DisplayPrice;
  href: string;
};

export function ListingCard({ listing, property, price, href }: ListingCardProps) {
  const pricePerSqm = formatDisplayPricePerSqm(price);
  const facts = getCardFacts(property);

  return (
    <Link href={href} className="group block rounded-card">
      <div className="relative">
        <PropertyIllustration
          seed={listing.id}
          kind={property.type}
          className="aspect-[4/3] rounded-card shadow-card transition-shadow group-hover:shadow-card-hover"
        />
        <DemoBadge className="absolute top-3 left-3" />
      </div>

      <div className="mt-3 px-1">
        <p className="text-xs font-semibold tracking-wide text-accent-700">
          {TRANSACTION_TYPES[listing.transactionType].label} · {PROPERTY_TYPES[property.type].label}
        </p>
        <h2 className="mt-0.5 text-base font-semibold text-navy group-hover:underline">
          {listing.title}
        </h2>
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
