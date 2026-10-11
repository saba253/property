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
import { formatArea } from "@/lib/pricing/format-money";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";

type ListingCardProps = ListingWithProperty & {
  price: DisplayPrice;
  href: string;
};

export function ListingCard({ listing, property, price, href }: ListingCardProps) {
  const pricePerSqm = formatDisplayPricePerSqm(price);
  const facts = [
    property.rooms !== undefined ? `${property.rooms} ოთახი` : null,
    formatArea(property.areaSqm),
    property.floor !== undefined ? `${property.floor} სართული` : null,
  ].filter((fact): fact is string => fact !== null);

  return (
    <Link href={href} className="group block rounded-card">
      <div className="relative">
        <PropertyIllustration
          seed={listing.id}
          className="aspect-[4/3] rounded-card shadow-card transition-shadow group-hover:shadow-card-hover"
        />
        <DemoBadge className="absolute top-3 left-3" />
      </div>

      <div className="mt-3 px-1">
        <h2 className="text-base font-semibold text-navy group-hover:underline">{listing.title}</h2>
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
