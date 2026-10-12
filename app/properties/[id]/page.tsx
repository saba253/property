import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RateNotice } from "@/components/currency/rate-notice";
import { DemoBadge, DemoNotice } from "@/components/properties/demo-label";
import {
  BackToListingsLink,
  BackToListingsLinkView,
  DetailPriceFormula,
  DetailPriceFormulaView,
  DetailPriceSummary,
  DetailPriceSummaryView,
  type PricesByCurrency,
} from "@/components/properties/detail-pricing";
import { AmenityList } from "@/components/properties/amenity-list";
import { type Fact, FactList } from "@/components/properties/fact-list";
import { PropertyIllustration } from "@/components/properties/property-illustration";
import { card, pageContainer } from "@/components/ui/styles";
import { getExchangeRateState } from "@/lib/currency/get-exchange-rate";
import { getListingDisplayPrice } from "@/lib/pricing/display-price";
import { getDemoListingIds, getDemoListingWithProperty } from "@/lib/properties/get-demo-listing";
import { PROPERTY_TYPES, TRANSACTION_TYPES } from "@/lib/properties/listing-types";
import { getStructuralFacts } from "@/lib/properties/property-facts";

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
  const { currency } = listing.askingPrice;
  // One rate snapshot; both currencies are prepared so the client can switch without a fetch.
  const rateState = await getExchangeRateState();
  const prices: PricesByCurrency = {
    USD: getListingDisplayPrice(data, "USD", rateState),
    GEL: getListingDisplayPrice(data, "GEL", rateState),
  };

  // Unknown facts are shown as "not specified"; nothing is invented to fill gaps.
  // City and district are shown under the title.
  const facts: Fact[] = [
    ...getStructuralFacts(property),
    { label: "ორიგინალი ვალუტა", value: currency },
  ];

  return (
    <main className={`${pageContainer} flex-1 py-6 sm:py-10`}>
      <Suspense
        fallback={<BackToListingsLinkView display="USD" transaction={listing.transactionType} />}
      >
        <BackToListingsLink transaction={listing.transactionType} />
      </Suspense>

      <div className="mt-4">
        <DemoNotice title="დემო განცხადება.">
          მონაცემები და ილუსტრაცია გამოგონილია და არ წარმოადგენს რეალურ ქონებას ან რეალურ
          განცხადებას.
        </DemoNotice>
      </div>

      <PropertyIllustration
        seed={listing.id}
        kind={property.type}
        className="mt-6 aspect-[4/3] rounded-card sm:aspect-[21/9]"
      />

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <DemoBadge />
            <span className="inline-flex items-center rounded-full bg-navy px-2.5 py-1 text-xs font-semibold text-white">
              {TRANSACTION_TYPES[listing.transactionType].label}
            </span>
            <span className="inline-flex items-center rounded-full bg-cream px-2.5 py-1 text-xs font-semibold text-navy ring-1 ring-line">
              {PROPERTY_TYPES[property.type].label}
            </span>
          </div>
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

          <section aria-labelledby="amenities-heading" className="mt-10">
            <h2 id="amenities-heading" className="text-xl font-semibold text-navy">
              კეთილმოწყობა
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              „არ არის მითითებული“ ნიშნავს, რომ ინფორმაცია უცნობია, და არა იმას, რომ ნივთი ან
              მახასიათებელი არ არსებობს.
            </p>
            <div className="mt-4">
              <AmenityList item={data} />
            </div>
          </section>

          <section aria-labelledby="calculation-heading" className="mt-10">
            <h2 id="calculation-heading" className="text-xl font-semibold text-navy">
              როგორ გამოითვლება ფასი კვადრატულ მეტრზე
            </h2>
            <Suspense
              fallback={
                <DetailPriceFormulaView prices={prices} areaSqm={property.areaSqm} display="USD" />
              }
            >
              <DetailPriceFormula prices={prices} areaSqm={property.areaSqm} />
            </Suspense>
            <div className="mt-4 space-y-3 text-sm leading-6 text-muted">
              {listing.transactionType === "rent" ? (
                <p>
                  ქირა კვადრატულ მეტრზე გამოითვლება განცხადებაში მითითებული თვიური ქირისა და ფართის
                  მიხედვით. ეს არის მოთხოვნილი ქირა და არა დადასტურებული ხელშეკრულების პირობები.
                </p>
              ) : (
                <p>
                  ფასი კვადრატულ მეტრზე გამოითვლება განცხადებაში მითითებული ფასისა და ფართის
                  მიხედვით. ეს არ არის გარიგების დადასტურებული ფასი და არ წარმოადგენს სამართლიან
                  ღირებულებას.
                </p>
              )}
              <p>
                ორიგინალი ფასი და ვალუტა ({currency}) არ იცვლება. სხვა ვალუტაში ნაჩვენები ფასი
                სავარაუდოა და ეროვნული ბანკის ოფიციალური კურსით გამოითვლება.
              </p>
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
            <Suspense
              fallback={
                <DetailPriceSummaryView listingId={listing.id} prices={prices} display="USD" />
              }
            >
              <DetailPriceSummary listingId={listing.id} prices={prices} />
            </Suspense>
          </div>
          <div className="mt-4">
            <RateNotice rateState={rateState} />
          </div>
        </aside>
      </div>
    </main>
  );
}
