import type { Metadata } from "next";
import Link from "next/link";
import { formatArea, formatMoney, formatPricePerSqm } from "@/lib/pricing/format-money";
import { calculateAskingPricePerSqm } from "@/lib/pricing/price-per-sqm";
import { getActiveDemoListingsWithProperties } from "@/lib/properties/get-demo-listing";

export const metadata: Metadata = {
  title: "დემო განცხადებები | Property Intelligence",
  // Demo pages must not be indexed by search engines.
  robots: { index: false, follow: false },
};

export default function DemoListingsPage() {
  const items = getActiveDemoListingsWithProperties();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/" className="text-sm text-slate-600 hover:text-slate-900">
        ← მთავარ გვერდზე დაბრუნება
      </Link>

      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <strong className="font-semibold">დემო განცხადებები.</strong> მონაცემები გამოგონილია და არ
        წარმოადგენს რეალურ ქონებას ან რეალურ განცხადებებს.
      </div>

      <h1 className="mt-8 text-2xl font-bold tracking-tight sm:text-4xl">დემო განცხადებები</h1>

      <p className="mt-2 text-slate-600">
        ფასები ნაჩვენებია განცხადების ვალუტაში და არ კონვერტირდება.
      </p>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {items.map(({ listing, property }) => {
          const { amount, currency } = listing.askingPrice;
          const pricePerSqm = calculateAskingPricePerSqm(amount, property.areaSqm);

          return (
            <li key={listing.id}>
              <Link
                href={`/properties/${listing.id}`}
                className="block h-full rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-400"
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
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-sm leading-6 text-slate-600">
        ფასი კვადრატულ მეტრზე გამოითვლება განცხადებაში მითითებული ფასისა და ფართის მიხედვით. ეს არ
        არის გარიგების დადასტურებული ფასი და არ წარმოადგენს სამართლიან ღირებულებას.
      </p>
    </main>
  );
}
