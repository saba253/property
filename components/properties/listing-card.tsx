import Link from "next/link";
import { formatArea, formatMoney, formatPricePerSqm } from "@/lib/pricing/format-money";
import { calculateAskingPricePerSqm } from "@/lib/pricing/price-per-sqm";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";

export function ListingCard({ listing, property }: ListingWithProperty) {
  const { amount, currency } = listing.askingPrice;
  const pricePerSqm = calculateAskingPricePerSqm(amount, property.areaSqm);

  return (
    <Link
      href={`/properties/${listing.id}`}
      className="block h-full rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
    >
      <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
        დემო
      </span>

      <h2 className="mt-4 text-lg font-semibold">{listing.title}</h2>

      <p className="mt-1 text-sm text-slate-600">
        {property.city}, {property.district}
      </p>

      <dl className="mt-4 space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">მითითებული ფასი</dt>
          <dd className="font-semibold">{formatMoney(amount, currency)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">ფართი</dt>
          <dd className="font-semibold">{formatArea(property.areaSqm)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">ფასი მ²-ზე</dt>
          <dd className="font-semibold">{formatPricePerSqm(pricePerSqm, currency)}</dd>
        </div>
      </dl>
    </Link>
  );
}
