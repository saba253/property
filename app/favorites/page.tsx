import type { Metadata } from "next";
import { Suspense } from "react";
import { CurrencyToggle } from "@/components/currency/currency-toggle";
import { FavoritesGrid } from "@/components/favorites/favorites-grid";
import { DemoDisclosure } from "@/components/properties/demo-label";
import { ListingCard } from "@/components/properties/listing-card";
import { pageContainer } from "@/components/ui/styles";
import { getExchangeRateState } from "@/lib/currency/get-exchange-rate";
import { getListingDisplayPrice } from "@/lib/pricing/display-price";
import { buildListingDetailHref } from "@/lib/properties/filter-chips";
import {
  getActiveDemoListingsWithProperties,
  getDemoListingCover,
} from "@/lib/properties/get-demo-listing";
import { parseDisplayCurrency } from "@/lib/properties/listing-filters";

export const metadata: Metadata = {
  title: "რჩეული განცხადებები | Property Intelligence",
  // Demo pages must not be indexed by search engines.
  robots: { index: false, follow: false },
};

/**
 * Cards for every available listing are rendered on the server with the shared ListingCard; the
 * browser shows only the ones saved in this browser. Nothing about the visitor is sent to the
 * server: the saved ids never leave the browser.
 */
async function SavedListings({ searchParams }: Pick<PageProps<"/favorites">, "searchParams">) {
  const { display } = parseDisplayCurrency(await searchParams);
  const rateState = await getExchangeRateState();
  const cards = getActiveDemoListingsWithProperties().map((item) => ({
    id: item.listing.id,
    card: (
      <ListingCard
        {...item}
        {...getDemoListingCover(item.listing.id)}
        price={getListingDisplayPrice(item, display, rateState)}
        href={buildListingDetailHref(item.listing.id, display)}
      />
    ),
  }));

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <DemoDisclosure />
        <CurrencyToggle
          current={display}
          hrefFor={{ USD: "/favorites", GEL: "/favorites?display=GEL" }}
        />
      </div>
      <FavoritesGrid cards={cards} />
    </>
  );
}

export default function FavoritesPage({ searchParams }: PageProps<"/favorites">) {
  return (
    <main className={`${pageContainer} flex-1 py-6 sm:py-10`}>
      <h1 className="text-3xl font-bold tracking-tight text-navy sm:text-4xl">
        რჩეული განცხადებები
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
        რჩეულები ინახება მხოლოდ ამ ბრაუზერში. ისინი არ სინქრონიზდება სხვა მოწყობილობებთან და
        შეიძლება წაიშალოს ბრაუზერის მონაცემების გასუფთავებისას.
      </p>
      <Suspense
        fallback={
          <p role="status" className="mt-8 text-sm text-muted">
            რჩეულები იტვირთება…
          </p>
        }
      >
        <SavedListings searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
