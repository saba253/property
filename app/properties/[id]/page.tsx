import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatArea, formatMoney, formatPricePerSqm } from "@/lib/pricing/format-money";
import { calculateAskingPricePerSqm } from "@/lib/pricing/price-per-sqm";
import { getDemoListingIds, getDemoListingWithProperty } from "@/lib/properties/get-demo-listing";

type PageProps = {
  params: Promise<{ id: string }>;
};

export function generateStaticParams() {
  return getDemoListingIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const data = getDemoListingWithProperty(id);

  return {
    title: data ? `${data.listing.title} | Property Intelligence` : "Property Intelligence",
    // Demo pages must not be indexed by search engines.
    robots: { index: false, follow: false },
  };
}

export default async function PropertyDetailPage({ params }: PageProps) {
  const { id } = await params;
  const data = getDemoListingWithProperty(id);

  if (!data) {
    notFound();
  }

  const { listing, property } = data;
  const { amount, currency } = listing.askingPrice;
  const pricePerSqm = calculateAskingPricePerSqm(amount, property.areaSqm);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/" className="text-sm text-slate-600 hover:text-slate-900">
        ← მთავარ გვერდზე დაბრუნება
      </Link>

      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <strong className="font-semibold">დემო განცხადება.</strong> მონაცემები გამოგონილია და არ
        წარმოადგენს რეალურ ქონებას ან რეალურ განცხადებას.
      </div>

      <div className="mt-8">
        <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
          დემო
        </span>

        <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-4xl">{listing.title}</h1>

        <p className="mt-2 text-lg text-slate-600">
          {property.city}, {property.district}
        </p>
      </div>

      <dl className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <dt className="text-sm text-slate-500">განცხადებაში მითითებული ფასი</dt>
          <dd className="mt-2 text-2xl font-bold">{formatMoney(amount, currency)}</dd>
          <dd className="mt-1 text-xs text-slate-500">ვალუტა: {currency}</dd>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <dt className="text-sm text-slate-500">ფართი</dt>
          <dd className="mt-2 text-2xl font-bold">{formatArea(property.areaSqm)}</dd>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <dt className="text-sm text-slate-500">მითითებული ფასი კვადრატულ მეტრზე</dt>
          <dd className="mt-2 text-2xl font-bold">{formatPricePerSqm(pricePerSqm, currency)}</dd>
          <dd className="mt-1 text-xs text-slate-500">ავტომატურად გამოითვლება</dd>
        </div>
      </dl>

      <div className="mt-6 space-y-3 text-sm leading-6 text-slate-600">
        <p>
          ფასი კვადრატულ მეტრზე გამოითვლება განცხადებაში მითითებული ფასისა და ფართის მიხედვით. ეს არ
          არის გარიგების დადასტურებული ფასი და არ წარმოადგენს სამართლიან ღირებულებას.
        </p>
        <p>ფასები ნაჩვენებია განცხადების ვალუტაში ({currency}) და არ კონვერტირდება.</p>
      </div>
    </main>
  );
}
