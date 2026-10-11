import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoBadge, DemoNotice } from "@/components/properties/demo-label";
import { type Fact, FactList } from "@/components/properties/fact-list";
import { PricePerSqmCallout } from "@/components/properties/price-per-sqm";
import { PropertyIllustration } from "@/components/properties/property-illustration";
import { buttonSecondary, card, pageContainer } from "@/components/ui/styles";
import { formatArea, formatMoney, formatPricePerSqm } from "@/lib/pricing/format-money";
import { calculateAskingPricePerSqm } from "@/lib/pricing/price-per-sqm";
import { getDemoListingIds, getDemoListingWithProperty } from "@/lib/properties/get-demo-listing";

type PageProps = {
  params: Promise<{ id: string }>;
};

// With partialPrefetching, unknown ids would otherwise stream the App Shell first and commit
// HTTP 200 before notFound() runs. "navigation" waits for the full render, so they return 404.
export const ensureStatic = "navigation";
// The page awaits params outside <Suspense> on purpose (so notFound() can set the status).
// This turns off only the instant-navigation check; ensureStatic's static check still applies.
export const instant = false;

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

  // Optional facts are shown only when the listing states them; nothing is invented to fill gaps.
  const facts: Fact[] = [
    { label: "ქალაქი", value: property.city },
    { label: "უბანი", value: property.district },
    { label: "ფართი", value: formatArea(property.areaSqm) },
    ...(property.rooms !== undefined ? [{ label: "ოთახები", value: String(property.rooms) }] : []),
    ...(property.floor !== undefined ? [{ label: "სართული", value: String(property.floor) }] : []),
    { label: "ვალუტა", value: currency },
  ];

  return (
    <main className={`${pageContainer} flex-1 py-6 sm:py-10`}>
      <Link
        href="/properties"
        className="inline-flex items-center gap-1 rounded-full text-sm font-medium text-muted hover:text-ink"
      >
        ← დემო განცხადებები
      </Link>

      <div className="mt-4">
        <DemoNotice title="დემო განცხადება.">
          მონაცემები და ილუსტრაცია გამოგონილია და არ წარმოადგენს რეალურ ქონებას ან რეალურ
          განცხადებას.
        </DemoNotice>
      </div>

      <PropertyIllustration
        seed={listing.id}
        className="mt-6 aspect-[4/3] rounded-card sm:aspect-[21/9]"
      />

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <DemoBadge />
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-navy sm:text-4xl">
            {listing.title}
          </h1>
          <p className="mt-2 text-lg text-muted">
            {property.city}, {property.district}
          </p>

          <section aria-labelledby="facts-heading" className="mt-8">
            <h2 id="facts-heading" className="text-xl font-semibold text-navy">
              ქონების მონაცემები
            </h2>
            <div className="mt-4">
              <FactList facts={facts} />
            </div>
          </section>

          <section aria-labelledby="calculation-heading" className="mt-10">
            <h2 id="calculation-heading" className="text-xl font-semibold text-navy">
              როგორ გამოითვლება ფასი კვადრატულ მეტრზე
            </h2>
            <p className="mt-3 rounded-2xl border border-line bg-surface p-4 text-base font-medium text-ink">
              {formatMoney(amount, currency)} ÷ {formatArea(property.areaSqm)} ={" "}
              <span className="text-accent-700">{formatPricePerSqm(pricePerSqm, currency)}</span>
            </p>
            <div className="mt-4 space-y-3 text-sm leading-6 text-muted">
              <p>
                ფასი კვადრატულ მეტრზე გამოითვლება განცხადებაში მითითებული ფასისა და ფართის მიხედვით.
                ეს არ არის გარიგების დადასტურებული ფასი და არ წარმოადგენს სამართლიან ღირებულებას.
              </p>
              <p>ფასები ნაჩვენებია განცხადების ვალუტაში ({currency}) და არ კონვერტირდება.</p>
            </div>
          </section>

          <section aria-labelledby="source-heading" className="mt-10">
            <h2 id="source-heading" className="text-xl font-semibold text-navy">
              მონაცემების წყარო
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              დემო მონაცემები: განცხადების ყველა მონაცემი გამოგონილია პლატფორმის საჩვენებლად. სურათი
              არის ილუსტრაცია და არა ქონების რეალური ფოტო.
            </p>
          </section>
        </div>

        <aside aria-label="ფასის შეჯამება" className="lg:sticky lg:top-24 lg:self-start">
          <div className={`${card} p-5`}>
            <p className="text-sm text-muted">განცხადებაში მითითებული ფასი</p>
            <p className="mt-1 text-3xl font-bold text-ink">{formatMoney(amount, currency)}</p>
            <p className="mt-1 text-xs text-subtle">ვალუტა: {currency}</p>

            <div className="mt-5">
              <PricePerSqmCallout pricePerSqm={pricePerSqm} currency={currency} />
            </div>

            <Link href="/properties" className={`${buttonSecondary} mt-5 w-full`}>
              სხვა დემო განცხადებები
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
