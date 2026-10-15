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
import { parseIdsParam } from "@/lib/api/listing-lookup";
import { buildFavoritesPageHref } from "@/lib/compare/selection-urls";
import { getListingCoversUncached, getListingsByIds } from "@/lib/data/listings";
import { MAX_FAVORITES } from "@/lib/favorites/favorites";
import { parseDisplayCurrency } from "@/lib/properties/listing-filters";

export const metadata: Metadata = {
  title: "რჩეული განცხადებები | Property Intelligence",
  // Demo pages must not be indexed by search engines.
  robots: { index: false, follow: false },
};

/**
 * Cards only for the saved listings: the browser puts the saved ids in the URL (`?ids=`, kept in
 * sync by SelectionUrlSync), and the server renders those with the shared ListingCard in one batch
 * lookup. The ids are public listing ids (no account, no personal data); they are stored only in
 * this browser and sent only to render this page.
 */
async function SavedListings({ searchParams }: Pick<PageProps<"/favorites">, "searchParams">) {
  const query = await searchParams;
  const { display } = parseDisplayCurrency(query);
  // Only the listings saved in this browser, as carried in the URL (see SelectionUrlSync).
  const requestedIds = parseIdsParam(query.ids, MAX_FAVORITES);
  const rateState = await getExchangeRateState();
  const listings = (await getListingsByIds(requestedIds)).filter(
    (item) => item.listing.status === "active",
  );
  const covers = await getListingCoversUncached(listings.map((item) => item.listing.id));
  const cards = listings.map((item) => ({
    id: item.listing.id,
    card: (
      <ListingCard
        {...item}
        {...covers[item.listing.id]}
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
          hrefFor={{
            USD: buildFavoritesPageHref(requestedIds, "USD"),
            GEL: buildFavoritesPageHref(requestedIds, "GEL"),
          }}
        />
      </div>
      <FavoritesGrid cards={cards} requestedIds={requestedIds} />
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
