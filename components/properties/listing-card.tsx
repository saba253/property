import Link from "next/link";
import { DemoBadge } from "@/components/properties/demo-label";
import { PricePerSqmChip } from "@/components/properties/price-per-sqm";
import { PropertyIllustration } from "@/components/properties/property-illustration";
import { formatArea, formatMoney } from "@/lib/pricing/format-money";
import { calculateAskingPricePerSqm } from "@/lib/pricing/price-per-sqm";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";

export function ListingCard({ listing, property }: ListingWithProperty) {
  const { amount, currency } = listing.askingPrice;
  const pricePerSqm = calculateAskingPricePerSqm(amount, property.areaSqm);
  const facts = [
    property.rooms !== undefined ? `${property.rooms} ოთახი` : null,
    formatArea(property.areaSqm),
    property.floor !== undefined ? `${property.floor} სართული` : null,
  ].filter((fact): fact is string => fact !== null);

  return (
    <Link href={`/properties/${listing.id}`} className="group block rounded-card">
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
          <p className="text-lg font-bold text-ink">
            {formatMoney(amount, currency)}
            <span className="sr-only">, მითითებული ფასი, ვალუტა {currency}</span>
          </p>
          <PricePerSqmChip pricePerSqm={pricePerSqm} currency={currency} />
        </div>
      </div>
    </Link>
  );
}
