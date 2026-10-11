import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ListingCard } from "@/components/properties/listing-card";
import {
  ListingFiltersForm,
  type ListingFilterFormValues,
} from "@/components/properties/listing-filters-form";
import { getCitiesPresentIn } from "@/lib/properties/cities";
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

  return (
    <>
      {/* The key remounts the form so its fields always match the current URL. */}
      <ListingFiltersForm key={JSON.stringify(values)} cities={cities} values={values} />

      {parsed.issues.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
          {parsed.issues.map((issue, index) => (
            <li key={index}>{issueMessage(issue)}</li>
          ))}
        </ul>
      )}

      <p role="status" className="mt-6 text-sm font-medium text-slate-700">
        ნაპოვნია {items.length} განცხადება
        {hasActiveFilters(parsed.filters) ? ` (სულ ${allItems.length})` : ""}
      </p>

      {items.length > 0 ? (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.listing.id}>
              <ListingCard {...item} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-lg font-semibold">ამ ფილტრებით განცხადება ვერ მოიძებნა</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            სცადეთ ფასის ან ფართის დიაპაზონის გაფართოება, სხვა ქალაქის ან ვალუტის არჩევა.
          </p>
          <Link
            href="/properties"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-slate-900 px-6 text-base font-medium text-white transition-colors hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            ფილტრების გასუფთავება
          </Link>
        </div>
      )}
    </>
  );
}

export default function DemoListingsPage({ searchParams }: PageProps<"/properties">) {
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

      <div className="mt-8">
        {/* Filters depend on the URL query, so they render at request time inside Suspense. */}
        <Suspense fallback={<p className="text-sm text-slate-500">ფილტრები იტვირთება…</p>}>
          <FilteredListings searchParams={searchParams} />
        </Suspense>
      </div>

      <p className="mt-6 text-sm leading-6 text-slate-600">
        ფასი კვადრატულ მეტრზე გამოითვლება განცხადებაში მითითებული ფასისა და ფართის მიხედვით. ეს არ
        არის გარიგების დადასტურებული ფასი და არ წარმოადგენს სამართლიან ღირებულებას.
      </p>
    </main>
  );
}
