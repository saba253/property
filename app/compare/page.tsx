import type { Metadata } from "next";
import { Suspense } from "react";
import { ComparisonView } from "@/components/compare/comparison-view";
import { CurrencyToggle } from "@/components/currency/currency-toggle";
import { RateNotice } from "@/components/currency/rate-notice";
import { DemoDisclosure } from "@/components/properties/demo-label";
import { pageContainer } from "@/components/ui/styles";
import { buildComparisonColumns } from "@/lib/compare/comparison";
import { getExchangeRateState } from "@/lib/currency/get-exchange-rate";
import { buildListingDetailHref } from "@/lib/properties/filter-chips";
import {
  getActiveDemoListingsWithProperties,
  getDemoListingCover,
} from "@/lib/properties/get-demo-listing";
import { parseDisplayCurrency } from "@/lib/properties/listing-filters";

export const metadata: Metadata = {
  title: "შედარება | Property Intelligence",
  // Demo pages must not be indexed by search engines.
  robots: { index: false, follow: false },
};

/**
 * Columns for every available listing are prepared on the server from one exchange-rate snapshot;
 * the browser shows the ones selected in this browser. The selection never leaves the browser.
 */
async function Comparison({ searchParams }: Pick<PageProps<"/compare">, "searchParams">) {
  const { display } = parseDisplayCurrency(await searchParams);
  const rateState = await getExchangeRateState();
  const columns = buildComparisonColumns(
    getActiveDemoListingsWithProperties(),
    (item) => ({
      href: buildListingDetailHref(item.listing.id, display),
      coverImage: getDemoListingCover(item.listing.id).coverImage,
    }),
    display,
    rateState,
  );

  return (
    <>
      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <DemoDisclosure />
        <div className="flex flex-wrap items-start gap-3">
          <CurrencyToggle
            current={display}
            hrefFor={{ USD: "/compare", GEL: "/compare?display=GEL" }}
          />
          <div className="lg:min-w-[24rem]">
            <RateNotice rateState={rateState} />
          </div>
        </div>
      </div>
      <ComparisonView columns={columns} />
    </>
  );
}

export default function ComparePage({ searchParams }: PageProps<"/compare">) {
  return (
    <main className={`${pageContainer} flex-1 py-6 sm:py-10`}>
      <h1 className="text-3xl font-bold tracking-tight text-navy sm:text-4xl">შედარება</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
        ფასები განცხადებებში მითითებული ფასებია და არა გარიგების, შეფასების ან საბაზრო ფასები.
        „ყველაზე დაბალი“ და „ყველაზე მაღალი“ მხოლოდ რიცხვებს ადარებს და არ ნიშნავს უკეთეს ან უარეს
        შეთავაზებას. სხვა ვალუტაში ნაჩვენები ფასი (≈) სავარაუდოა. არჩევანი ინახება მხოლოდ ამ
        ბრაუზერში.
      </p>
      <Suspense
        fallback={
          <p role="status" className="mt-8 text-sm text-muted">
            შედარება იტვირთება…
          </p>
        }
      >
        <Comparison searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
