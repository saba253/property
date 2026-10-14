import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CurrencyToggle } from "@/components/currency/currency-toggle";
import { MapResults } from "@/components/map/map-results";
import { ViewToggle } from "@/components/map/view-toggle";
import { RateNotice } from "@/components/currency/rate-notice";
import { DemoDisclosure } from "@/components/properties/demo-label";
import { ListingCard } from "@/components/properties/listing-card";
import { TransactionTabs } from "@/components/properties/transaction-tabs";
import { SearchFeedback } from "@/components/search/search-feedback";
import { SortMenu } from "@/components/properties/sort-menu";
import {
  ListingFiltersForm,
  type ListingFilterFormValues,
} from "@/components/properties/listing-filters-form";
import { buttonPrimary, pageContainer } from "@/components/ui/styles";
import { getExchangeRateState } from "@/lib/currency/get-exchange-rate";
import { toMapListing } from "@/lib/map/map-listings";
import { getListingDisplayPrice } from "@/lib/pricing/display-price";
import { getAmenityDefinition } from "@/lib/properties/amenities";
import { getCitiesPresentIn, getDistrictsPresentIn } from "@/lib/properties/cities";
import { parseSearchQuery } from "@/lib/search/parse-search-query";
import {
  buildListingDetailHref,
  buildListingsHref,
  getFilterChips,
} from "@/lib/properties/filter-chips";
import {
  getActiveDemoListingsWithProperties,
  getDemoListingCover,
} from "@/lib/properties/get-demo-listing";
import {
  type CountFilterKey,
  type FilterIssue,
  type NumericFilterKey,
  type ParsedListingFilters,
  type RawQuery,
  convertBudgetForDisplay,
  countAdvancedFilters,
  filterListings,
  getTransaction,
  hasActiveFilters,
  parseDisplayCurrency,
  parseListingFilters,
  parseNonNegativeNumber,
  switchTransaction,
} from "@/lib/properties/listing-filters";
import {
  SORT_OPTIONS,
  type SortOption,
  parseSort,
  sortListings,
} from "@/lib/properties/listing-sort";
import { type ListingsView, parseListingsView } from "@/lib/properties/listings-view";
import type { Currency, TransactionType } from "@/lib/properties/types";

export const metadata: Metadata = {
  title: "დემო განცხადებები | Property Intelligence",
  // Demo pages must not be indexed by search engines.
  robots: { index: false, follow: false },
};

const NUMERIC_FIELD_LABELS: Record<NumericFilterKey | CountFilterKey | "rooms", string> = {
  rooms: "ოთახების რაოდენობა",
  minPrice: "მინიმალური ბიუჯეტი",
  maxPrice: "მაქსიმალური ბიუჯეტი",
  minArea: "მინიმალური ფართი",
  maxArea: "მაქსიმალური ფართი",
  minBedrooms: "საძინებლების რაოდენობა",
  minBathrooms: "სველი წერტილების რაოდენობა",
  minFloor: "მინიმალური სართული",
  maxFloor: "მაქსიმალური სართული",
};

function issueMessage(issue: FilterIssue): string {
  switch (issue.code) {
    case "invalid-city":
      return "მითითებული ქალაქი ვერ მოიძებნა, ამიტომ ქალაქის ფილტრი არ გამოიყენება.";
    case "invalid-currency":
      return "მითითებული ორიგინალი ვალუტა არასწორია. ხელმისაწვდომია მხოლოდ USD და GEL.";
    case "invalid-display-currency":
      return "მითითებული ჩვენების ვალუტა არასწორია, ამიტომ ფასები ნაჩვენებია USD-ში.";
    case "invalid-number":
      return `${NUMERIC_FIELD_LABELS[issue.field]}: მნიშვნელობა არასწორია და არ გამოიყენება.`;
    case "swapped-price-range":
      return "მინიმალური ბიუჯეტი მაქსიმალურზე მეტი იყო, ამიტომ მნიშვნელობები ადგილებით შეიცვალა.";
    case "swapped-area-range":
      return "მინიმალური ფართი მაქსიმალურზე მეტი იყო, ამიტომ მნიშვნელობები ადგილებით შეიცვალა.";
    case "swapped-floor-range":
      return "მინიმალური სართული მაქსიმალურზე მეტი იყო, ამიტომ მნიშვნელობები ადგილებით შეიცვალა.";
    case "invalid-amenity":
      return "ზოგიერთი მითითებული კეთილმოწყობა უცნობია და არ გამოიყენება.";
    case "invalid-transaction":
      return "მითითებული გარიგების ტიპი არასწორია, ამიტომ ნაჩვენებია გასაყიდი განცხადებები.";
    case "invalid-district":
      return "მითითებული უბანი განცხადებებში ვერ მოიძებნა, ამიტომ უბნის ფილტრი არ გამოიყენება.";
    case "district-not-in-city":
      return "მითითებული უბანი არჩეულ ქალაქში არ არის, ამიტომ უბნის ფილტრი არ გამოიყენება.";
    case "ambiguous-district":
      return "ამ სახელის უბანი რამდენიმე ქალაქშია. აირჩიეთ ქალაქი, რომ უბნის ფილტრი გამოიყენოს.";
    case "invalid-property-type":
      return "მითითებული ქონების ტიპი არასწორია, ამიტომ ნაჩვენებია ყველა ტიპი.";
    case "floor-not-applicable":
      return "სართულის ფილტრი მხოლოდ ბინებს ეხება, ამიტომ კერძო სახლებისთვის არ გამოიყენება.";
    case "amenity-not-applicable":
      return `„${getAmenityDefinition(issue.amenity).label}“ ამ ქონების ტიპს არ ეხება, ამიტომ ფილტრი არ გამოიყენება.`;
  }
}

/** Form values to show after submission, so the fields always match the current URL. */
function toFormValues(query: RawQuery, { filters }: ParsedListingFilters): ListingFilterFormValues {
  const numeric = (key: NumericFilterKey): string => {
    const raw = query[key];
    const fallback = parseNonNegativeNumber((Array.isArray(raw) ? raw[0] : raw) ?? "");
    const value = filters[key] ?? fallback;
    return value === null ? "" : String(value);
  };
  const count = (key: CountFilterKey): string =>
    filters[key] === undefined ? "" : String(filters[key]);

  return {
    propertyType: filters.propertyType ?? "",
    city: filters.citySlug ?? "",
    currency: filters.originalCurrency ?? "",
    minPrice: numeric("minPrice"),
    maxPrice: numeric("maxPrice"),
    minArea: numeric("minArea"),
    maxArea: numeric("maxArea"),
    rooms: filters.rooms === undefined ? "" : String(filters.rooms),
    district: filters.district ?? "",
    minBedrooms: count("minBedrooms"),
    minBathrooms: count("minBathrooms"),
    minFloor: count("minFloor"),
    maxFloor: count("maxFloor"),
    amenities: filters.amenities ?? [],
  };
}

async function FilteredListings({ searchParams }: Pick<PageProps<"/properties">, "searchParams">) {
  const rawQuery = await searchParams;
  // One exchange-rate snapshot for the whole request: filtering and display both use it.
  const rateState = await getExchangeRateState();
  const allItems = getActiveDemoListingsWithProperties();
  const cities = getCitiesPresentIn(allItems.map((item) => item.property.city));
  const districts = getDistrictsPresentIn(allItems.map((item) => item.property));

  // Free-text search from the homepage (?q=...). Recognized terms become the same URL parameters
  // the filter form uses and go through the same validation below; words in the text win over
  // the Buy/Rent tab, because they are the more specific statement of intent.
  const searchText = (Array.isArray(rawQuery.q) ? rawQuery.q[0] : rawQuery.q)?.trim() ?? "";
  const search = searchText
    ? parseSearchQuery(searchText, {
        cities,
        districts,
        defaultCurrency: parseDisplayCurrency(rawQuery).display,
      })
    : null;
  const { q: _searchText, ...explicitQuery } = rawQuery;
  void _searchText;
  const query: RawQuery = search ? { ...explicitQuery, ...search.params } : explicitQuery;

  const parsed = parseListingFilters(query, { knownDistricts: districts });
  // List or map; legacy URLs without `view` keep the list. Every link below keeps the view.
  const { view, invalid: invalidView } = parseListingsView(rawQuery);
  // Sorting is a view setting like the display currency: every link below keeps it.
  const { sort, invalid: invalidSort } = parseSort(rawQuery);
  const { filters, display } = parsed;
  const { matches: filtered, notComparableCount } = filterListings(
    allItems,
    filters,
    display,
    rateState,
  );
  // Filter first, then sort (same rate snapshot); list and map both show this order.
  const sorted = sortListings(filtered, sort, rateState);
  const matches = sorted.items;
  const values = toFormValues(query, parsed);
  const filtersActive = hasActiveFilters(filters);
  const chips = getFilterChips(filters, display, view, sort);
  const otherCurrency: Currency = display === "USD" ? "GEL" : "USD";
  const otherHref = buildListingsHref(
    convertBudgetForDisplay(filters, display, otherCurrency, rateState),
    otherCurrency,
    view,
    sort,
  );
  const toggleHrefs: Record<Currency, string> =
    display === "USD"
      ? { USD: buildListingsHref(filters, "USD", view, sort), GEL: otherHref }
      : { USD: otherHref, GEL: buildListingsHref(filters, "GEL", view, sort) };
  const viewHrefs: Record<ListingsView, string> = {
    list: buildListingsHref(filters, display, "list", sort),
    map: buildListingsHref(filters, display, "map", sort),
  };
  const sortHrefs = Object.fromEntries(
    SORT_OPTIONS.map((option) => [
      option.value,
      buildListingsHref(filters, display, view, option.value),
    ]),
  ) as Record<SortOption, string>;
  const resultsIncomplete = notComparableCount > 0;
  const transaction = getTransaction(filters);
  // "Total" counts only listings of the chosen transaction type (sale and rent are separate).
  const transactionTotal = allItems.filter(
    (item) => item.listing.transactionType === transaction,
  ).length;
  // Switching sale/rent keeps compatible filters but drops the budget (see switchTransaction).
  const transactionHrefs: Record<TransactionType, string> = {
    sale: buildListingsHref(switchTransaction(filters, "sale"), display, view, sort),
    rent: buildListingsHref(switchTransaction(filters, "rent"), display, view, sort),
  };
  // Reset clears filters but keeps the view settings: sale/rent tab, display currency, list/map
  // view and sort order. The sort menu has its own "ნაგულისხმევი" option.
  const resetHref = buildListingsHref({ transaction: filters.transaction }, display, view, sort);
  const cardData = (item: (typeof matches)[number]) => ({
    price: getListingDisplayPrice(item, display, rateState),
    href: buildListingDetailHref(item.listing.id, display),
    ...getDemoListingCover(item.listing.id),
  });

  return (
    <>
      <section aria-label="ძიება და ფილტრები" className="border-b border-line bg-cream">
        <div className={`${pageContainer} py-4 sm:py-5`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <TransactionTabs current={transaction} hrefFor={transactionHrefs} />
            <div className="flex flex-wrap items-center gap-3">
              <ViewToggle current={view} hrefFor={viewHrefs} />
              <CurrencyToggle current={display} hrefFor={toggleHrefs} />
            </div>
          </div>

          {/* The key remounts the form so its fields always match the current URL. */}
          <ListingFiltersForm
            key={JSON.stringify({ values, display })}
            cities={cities}
            districts={districts}
            values={values}
            display={display}
            transaction={transaction}
            advancedCount={countAdvancedFilters(filters)}
            showReset={filtersActive || parsed.issues.length > 0}
            resetHref={resetHref}
            view={view}
            sort={sort}
          />

          {search && <SearchFeedback query={searchText} search={search} />}

          {(parsed.issues.length > 0 || invalidView || invalidSort) && (
            <ul className="mt-4 space-y-1 rounded-2xl border border-accent-100 bg-accent-50 p-4 text-sm leading-6 text-navy">
              {parsed.issues.map((issue, index) => (
                <li key={index}>{issueMessage(issue)}</li>
              ))}
              {invalidView && <li>მითითებული ხედი არასწორია, ამიტომ შედეგები ნაჩვენებია სიით.</li>}
              {invalidSort && (
                <li>მითითებული დალაგება არასწორია, ამიტომ ნაჩვენებია ნაგულისხმევი რიგი.</li>
              )}
            </ul>
          )}

          {resultsIncomplete && (
            <p
              role="alert"
              className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"
            >
              <strong className="font-semibold">შედეგები არასრულია.</strong> გაცვლითი კურსი
              მიუწვდომელია, ამიტომ {notComparableCount} განცხადება, რომლის ორიგინალი ფასი{" "}
              {otherCurrency}-შია, ბიუჯეტთან ვერ შედარდა და სიაში არ არის. სცადეთ მოგვიანებით ან
              მოხსენით ბიუჯეტის ფილტრი.
            </p>
          )}
        </div>
      </section>

      {/* The map view uses a wider container for the list + map split. */}
      <div
        className={
          view === "map"
            ? "mx-auto w-full max-w-[90rem] px-4 py-5 sm:px-6 sm:py-6 lg:px-8"
            : `${pageContainer} py-5 sm:py-6`
        }
      >
        {/* Compact transparency row: demo disclosure and the NBG rate bar. */}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <DemoDisclosure />
          <div className="lg:min-w-[26rem]">
            <RateNotice rateState={rateState} />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-base font-semibold text-ink">
            ნაპოვნია {matches.length} განცხადება
            {filtersActive ? (
              <span className="font-normal text-muted"> (სულ {transactionTotal})</span>
            ) : null}
            {resultsIncomplete ? (
              <span className="font-normal text-amber-900"> · შედეგები არასრულია</span>
            ) : null}
          </p>
          <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">
            {matches.length > 1 && (
              // The key closes the menu after a sort link was followed.
              <SortMenu key={sort} current={sort} hrefFor={sortHrefs} />
            )}
          </div>
        </div>

        {sorted.notice === "rate-unavailable" && (
          <p
            role="note"
            className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900"
          >
            გაცვლითი კურსი მიუწვდომელია, ამიტომ USD-სა და GEL-ში მითითებული ფასები ერთმანეთს ვერ
            შედარდება. ფასით დალაგების ნაცვლად ნაჩვენებია ნაგულისხმევი რიგი.
          </p>
        )}

        {chips.length > 0 && (
          <ul aria-label="არჩეული ფილტრები" className="mt-3 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <li key={chip.key}>
                <Link
                  href={chip.removeHref}
                  aria-label={`${chip.label} — ფილტრის მოხსნა`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface py-1.5 pr-2.5 pl-3 text-sm text-ink transition-colors hover:border-ink"
                >
                  {chip.label}
                  <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4 fill-muted">
                    <path d="M4.47 4.47a.75.75 0 0 1 1.06 0L8 6.94l2.47-2.47a.75.75 0 1 1 1.06 1.06L9.06 8l2.47 2.47a.75.75 0 1 1-1.06 1.06L8 9.06l-2.47 2.47a.75.75 0 0 1-1.06-1.06L6.94 8 4.47 5.53a.75.75 0 0 1 0-1.06Z" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {matches.length > 0 && view === "map" ? (
          <div className="mt-5">
            {/* Same filtered results, prices and links as the list; the map never filters. */}
            <MapResults listings={matches.map((item) => toMapListing(item, cardData(item)))} />
          </div>
        ) : matches.length > 0 ? (
          <ul className="mt-5 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {matches.map((item) => (
              <li key={item.listing.id}>
                <ListingCard {...item} {...cardData(item)} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-5 rounded-card border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
            <svg viewBox="0 0 48 48" aria-hidden="true" className="mx-auto h-12 w-12">
              <circle
                cx="21"
                cy="21"
                r="13"
                fill="none"
                strokeWidth="4"
                className="stroke-sand-200"
              />
              <path
                d="m31 31 9 9"
                strokeWidth="4"
                strokeLinecap="round"
                className="stroke-sand-500"
              />
            </svg>
            <h2 className="mt-4 text-lg font-semibold text-navy">
              ამ ფილტრებით განცხადება ვერ მოიძებნა
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
              სცადეთ ბიუჯეტის ან ფართის დიაპაზონის გაფართოება, სხვა ქალაქის ან ვალუტის არჩევა.
            </p>
            <Link href={resetHref} className={`${buttonPrimary} mt-6`}>
              ფილტრების გასუფთავება
            </Link>
          </div>
        )}

        <p className="mt-12 max-w-3xl border-t border-line pt-5 text-xs leading-5 text-muted">
          ფასი კვადრატულ მეტრზე გამოითვლება განცხადებაში მითითებული ფასისა (ქირისთვის — თვიური
          ქირის) და ფართის მიხედვით. ეს არ არის გარიგების დადასტურებული ფასი და არ წარმოადგენს
          სამართლიან ღირებულებას.
        </p>
      </div>
    </>
  );
}

function ListingsSkeleton() {
  return (
    <div aria-busy="true">
      <p className="sr-only">განცხადებები იტვირთება…</p>
      <div className="border-b border-line bg-cream">
        <div className={`${pageContainer} py-4 sm:py-5`}>
          <div className="h-10 w-64 animate-pulse rounded-full bg-line/70" />
          <div className="mt-3 h-40 animate-pulse rounded-card bg-line/60 lg:h-28" />
        </div>
      </div>
      <div className={`${pageContainer} mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3`}>
        {[0, 1, 2].map((index) => (
          <div key={index} className="aspect-[4/3] animate-pulse rounded-card bg-line/60" />
        ))}
      </div>
    </div>
  );
}

export default function DemoListingsPage({ searchParams }: PageProps<"/properties">) {
  return (
    <main className="flex-1">
      {/* Visually hidden heading: the page opens directly with the search controls. */}
      <h1 className="sr-only">უძრავი ქონების ძიება (დემო განცხადებები)</h1>
      {/* Filters depend on the URL query, so they render at request time inside Suspense. */}
      <Suspense fallback={<ListingsSkeleton />}>
        <FilteredListings searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
