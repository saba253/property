import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DemoNotice } from "@/components/properties/demo-label";
import { ListingCard } from "@/components/properties/listing-card";
import {
  ListingFiltersForm,
  type ListingFilterFormValues,
} from "@/components/properties/listing-filters-form";
import { buttonPrimary, pageContainer } from "@/components/ui/styles";
import { getCitiesPresentIn } from "@/lib/properties/cities";
import { getFilterChips } from "@/lib/properties/filter-chips";
import { getActiveDemoListingsWithProperties } from "@/lib/properties/get-demo-listing";
import {
  type FilterIssue,
  type NumericFilterKey,
  type ParsedListingFilters,
  type RawQuery,
  filterListings,
  hasActiveFilters,
  parseListingFilters,
  parseNonNegativeNumber,
} from "@/lib/properties/listing-filters";

export const metadata: Metadata = {
  title: "დემო განცხადებები | Property Intelligence",
  // Demo pages must not be indexed by search engines.
  robots: { index: false, follow: false },
};

const NUMERIC_FIELD_LABELS: Record<NumericFilterKey, string> = {
  minPrice: "მინიმალური ფასი",
  maxPrice: "მაქსიმალური ფასი",
  minArea: "მინიმალური ფართი",
  maxArea: "მაქსიმალური ფართი",
};

function issueMessage(issue: FilterIssue): string {
  switch (issue.code) {
    case "invalid-city":
      return "მითითებული ქალაქი ვერ მოიძებნა, ამიტომ ქალაქის ფილტრი არ გამოიყენება.";
    case "invalid-currency":
      return "მითითებული ვალუტა არასწორია. ხელმისაწვდომია მხოლოდ USD და GEL.";
    case "invalid-number":
      return `${NUMERIC_FIELD_LABELS[issue.field]}: მნიშვნელობა არასწორია და არ გამოიყენება.`;
    case "price-needs-currency":
      return "ფასის ფილტრი არ გამოიყენება, რადგან ვალუტა არ არის არჩეული. აირჩიეთ USD ან GEL.";
    case "swapped-price-range":
      return "მინიმალური ფასი მაქსიმალურზე მეტი იყო, ამიტომ მნიშვნელობები ადგილებით შეიცვალა.";
    case "swapped-area-range":
      return "მინიმალური ფართი მაქსიმალურზე მეტი იყო, ამიტომ მნიშვნელობები ადგილებით შეიცვალა.";
  }
}

/**
 * Form values to show after submission. Valid numbers stay in the form even when a price limit
 * was ignored for lack of a currency, so the user only has to pick one.
 */
function toFormValues(query: RawQuery, { filters }: ParsedListingFilters): ListingFilterFormValues {
  const numeric = (key: NumericFilterKey): string => {
    const raw = query[key];
    const fallback = parseNonNegativeNumber((Array.isArray(raw) ? raw[0] : raw) ?? "");
    const value = filters[key] ?? fallback;
    return value === null ? "" : String(value);
  };

  return {
    city: filters.citySlug ?? "",
    currency: filters.currency ?? "",
    minPrice: numeric("minPrice"),
    maxPrice: numeric("maxPrice"),
    minArea: numeric("minArea"),
    maxArea: numeric("maxArea"),
  };
}

async function FilteredListings({ searchParams }: Pick<PageProps<"/properties">, "searchParams">) {
  const query = await searchParams;
  const parsed = parseListingFilters(query);
  const allItems = getActiveDemoListingsWithProperties();
  const items = filterListings(allItems, parsed.filters);
  const cities = getCitiesPresentIn(allItems.map((item) => item.property.city));
  const values = toFormValues(query, parsed);
  const filtersActive = hasActiveFilters(parsed.filters);
  const chips = getFilterChips(parsed.filters);

  return (
    <>
      {/* The key remounts the form so its fields always match the current URL. */}
      <ListingFiltersForm
        key={JSON.stringify(values)}
        cities={cities}
        values={values}
        showReset={filtersActive || parsed.issues.length > 0}
      />

      {parsed.issues.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-2xl border border-accent-100 bg-accent-50 p-4 text-sm leading-6 text-navy">
          {parsed.issues.map((issue, index) => (
            <li key={index}>{issueMessage(issue)}</li>
          ))}
        </ul>
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" className="text-base font-semibold text-ink">
          ნაპოვნია {items.length} განცხადება
          {filtersActive ? (
            <span className="font-normal text-muted"> (სულ {allItems.length})</span>
          ) : null}
        </p>

        {chips.length > 0 && (
          <ul aria-label="არჩეული ფილტრები" className="flex flex-wrap gap-2">
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
      </div>

      {items.length > 0 ? (
        <ul className="mt-5 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.listing.id}>
              <ListingCard {...item} />
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
            სცადეთ ფასის ან ფართის დიაპაზონის გაფართოება, სხვა ქალაქის ან ვალუტის არჩევა.
          </p>
          <Link href="/properties" className={`${buttonPrimary} mt-6`}>
            ფილტრების გასუფთავება
          </Link>
        </div>
      )}
    </>
  );
}

function ListingsSkeleton() {
  return (
    <div aria-busy="true">
      <p className="sr-only">განცხადებები იტვირთება…</p>
      <div className="h-40 animate-pulse rounded-card bg-line/60 lg:h-28" />
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
      <section className="border-b border-line bg-cream">
        <div className={`${pageContainer} py-8 sm:py-12`}>
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight text-navy sm:text-4xl">
              დემო განცხადებები
            </h1>
            <p className="mt-2 text-base leading-7 text-muted">
              შეადარეთ განცხადებებში მითითებული ფასები და ფასი კვადრატულ მეტრზე. ფასები ნაჩვენებია
              განცხადების ვალუტაში და არ კონვერტირდება.
            </p>
          </div>

          <div className="mt-6">
            <DemoNotice title="დემო განცხადებები.">
              მონაცემები და ილუსტრაციები გამოგონილია და არ წარმოადგენს რეალურ ქონებას ან რეალურ
              განცხადებებს.
            </DemoNotice>
          </div>
        </div>
      </section>

      <div className={`${pageContainer} py-8 sm:py-10`}>
        {/* Filters depend on the URL query, so they render at request time inside Suspense. */}
        {/* A map view can be added beside the results in a later step. */}
        <Suspense fallback={<ListingsSkeleton />}>
          <FilteredListings searchParams={searchParams} />
        </Suspense>

        <p className="mt-12 max-w-3xl border-t border-line pt-6 text-sm leading-6 text-muted">
          ფასი კვადრატულ მეტრზე გამოითვლება განცხადებაში მითითებული ფასისა და ფართის მიხედვით. ეს არ
          არის გარიგების დადასტურებული ფასი და არ წარმოადგენს სამართლიან ღირებულებას.
        </p>
      </div>
    </main>
  );
}
