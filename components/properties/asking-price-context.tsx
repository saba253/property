import Link from "next/link";
import { type ReactNode, Suspense } from "react";
import { DisplayCurrencySwitch } from "@/components/currency/display-currency-switch";
import {
  type AskingPriceContext,
  type PriceStats,
  describeDifference,
  formatStatPerSqm,
  positionInRange,
} from "@/lib/analytics/asking-price-context";
import { MIN_COMPARABLES, areaRange } from "@/lib/analytics/comparables";
import { formatArea } from "@/lib/pricing/format-money";
import { buildListingDetailHref } from "@/lib/properties/filter-chips";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import { PROPERTY_TYPES, TRANSACTION_TYPES } from "@/lib/properties/listing-types";
import type { Currency } from "@/lib/properties/types";

/*
 * Compact, secondary section on the detail page. Rendered on the server; only the currency
 * switch of the "ready" state runs in the browser. Wording stays descriptive: asking prices of
 * similar demo listings, never a valuation and never "cheap" or "expensive".
 */

export const INSUFFICIENT_DATA_MESSAGE =
  "ამ განცხადების ფასის შესადარებლად ჯერ საკმარისი მსგავსი განცხადება არ გვაქვს.";

const MAX_LISTED_COMPARABLES = 10;

type Props = { subject: ListingWithProperty; context: AskingPriceContext };

/** "იყიდება · ბინა · თბილისი · 49–81 მ²": what the comparison is limited to. */
function scopeCriteria({ listing, property }: ListingWithProperty, district: string | null) {
  const { min, max } = areaRange(property.areaSqm);
  return [
    TRANSACTION_TYPES[listing.transactionType].label,
    PROPERTY_TYPES[property.type].label,
    district ? `${property.city}, ${district}` : property.city,
    `${Math.round(min)}–${formatArea(Math.round(max))}`,
  ].join(" · ");
}

function CalmNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-3 rounded-2xl bg-cream px-4 py-3 text-sm leading-6 text-muted ring-1 ring-line">
      <p>
        <span className="font-semibold text-navy">{title}</span> {children}
      </p>
    </div>
  );
}

export function AskingPriceContextSection({ subject, context }: Props) {
  return (
    <section aria-labelledby="price-context-heading" className="mt-10">
      <h2 id="price-context-heading" className="text-xl font-semibold text-navy">
        მოთხოვნილი ფასის შედარება
      </h2>
      <AskingPriceContextBody subject={subject} context={context} />
    </section>
  );
}

function AskingPriceContextBody({ subject, context }: Props) {
  switch (context.status) {
    case "invalid-subject":
      return (
        <CalmNote title="მონაცემები არასაკმარისია.">
          ფასის ან ფართის გარეშე შედარება შეუძლებელია.
        </CalmNote>
      );
    case "insufficient": {
      const found = Math.max(context.districtCount, context.cityCount);
      return (
        <CalmNote title="მონაცემები არასაკმარისია.">
          {INSUFFICIENT_DATA_MESSAGE}
          <span className="mt-1 block text-xs text-subtle">
            ვეძებთ: {scopeCriteria(subject, null)}. ნაპოვნია {found}, საჭიროა მინიმუმ{" "}
            {MIN_COMPARABLES}.
          </span>
        </CalmNote>
      );
    }
    case "rate-unavailable":
      return (
        <CalmNote title="შედარება დროებით მიუწვდომელია.">
          გაცვლითი კურსი მიუწვდომელია, ამიტომ USD-სა და GEL-ში მითითებული ფასები ერთმანეთს ვერ
          შედარდება.
        </CalmNote>
      );
    case "ready": {
      const variant = (display: Currency) => (
        <ReadyView subject={subject} context={context} display={display} />
      );
      return (
        <Suspense fallback={variant("USD")}>
          <DisplayCurrencySwitch variants={{ USD: variant("USD"), GEL: variant("GEL") }} />
        </Suspense>
      );
    }
  }
}

type ReadyContext = Extract<AskingPriceContext, { status: "ready" }>;

function ReadyView({
  subject,
  context,
  display,
}: {
  subject: ListingWithProperty;
  context: ReadyContext;
  display: Currency;
}) {
  // Without an exchange rate only the listings' shared currency can be shown.
  const stats = (context.byCurrency[display] ??
    context.byCurrency[display === "USD" ? "GEL" : "USD"]) as PriceStats;
  const { period, scope } = context;
  const approx = stats.isConverted ? "≈ " : "";
  const format = (value: number) => `${approx}${formatStatPerSqm(value, stats.currency, period)}`;
  const district = scope === "district" ? subject.property.district : null;
  const listed = context.comparables
    .map((item, index) => ({ item, value: stats.values[index] }))
    .sort(
      (a, b) =>
        Math.abs(a.item.property.areaSqm - subject.property.areaSqm) -
        Math.abs(b.item.property.areaSqm - subject.property.areaSqm),
    )
    .slice(0, MAX_LISTED_COMPARABLES);

  return (
    <div className="mt-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <dl className="grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">ფასი მ²-ზე (ეს განცხადება)</dt>
          <dd className="mt-0.5 text-base font-semibold text-navy">
            {format(stats.subjectPerSqm)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">მსგავსი განცხადებების მედიანა</dt>
          <dd className="mt-0.5 text-base font-semibold text-navy">{format(stats.median)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">შესადარებელი განცხადებები</dt>
          <dd className="mt-0.5 text-base font-semibold text-navy">{stats.count}</dd>
        </div>
      </dl>

      <p className="mt-3 text-sm text-ink">
        მოთხოვნილი ფასი მ²-ზე {describeDifference(stats.differencePercent)}.
      </p>

      <RangeBar stats={stats} format={format} />

      <p className="mt-3 text-xs leading-5 text-subtle">
        {scope === "district"
          ? `შედარება იმავე უბანში: ${scopeCriteria(subject, district)}.`
          : `შედარება მთელ ქალაქში (უბანში საკმარისი მსგავსი განცხადება არ არის): ${scopeCriteria(subject, null)}.`}{" "}
        {stats.currency !== display && "ფასები ნაჩვენებია ორიგინალ ვალუტაში, კურსი მიუწვდომელია. "}
        ეს მოთხოვნილი ფასების აღწერითი შედარებაა დემო მონაცემებით და არა ქონების შეფასება ან
        გარიგების ფასები.
      </p>

      <details className="group mt-3 border-t border-line pt-3">
        <summary className="cursor-pointer text-sm font-semibold text-accent-700">
          მეთოდოლოგია და შესადარებელი განცხადებები
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-muted">
          <li>იგივე გარიგების ტიპი და ქონების ტიპი, იგივე ქალაქი, ფართი ±25%; ჯერ იმავე უბანში.</li>
          <li>
            მინიმუმ {MIN_COMPARABLES} მსგავსი განცხადება; ერთი ქონების რამდენიმე განცხადება ერთხელ
            ითვლება.
          </li>
          <li>ყველა ფასი ერთ ვალუტაშია, ეროვნული ბანკის ერთი კურსით; ქირა ითვლება თვეზე.</li>
        </ul>
        <ul className="mt-3 divide-y divide-line text-sm">
          {listed.map(({ item, value }) => (
            <li key={item.listing.id} className="flex flex-wrap justify-between gap-x-3 py-1.5">
              <Link
                href={buildListingDetailHref(item.listing.id, display)}
                className="min-w-0 font-medium text-navy underline-offset-4 hover:underline"
              >
                {item.listing.title}
              </Link>
              <span className="text-muted">
                {item.property.district} · {formatArea(item.property.areaSqm)} · {format(value)}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/** Min–max track with the median (navy tick) and this listing (blue dot). No chart library. */
function RangeBar({ stats, format }: { stats: PriceStats; format: (value: number) => string }) {
  const median = positionInRange(stats.median, stats.min, stats.max);
  const subject = positionInRange(stats.subjectPerSqm, stats.min, stats.max);
  return (
    <div className="mt-4">
      <div aria-hidden="true" className="relative h-2 rounded-full bg-cream ring-1 ring-line">
        <span
          className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-navy"
          style={{ left: `${median}%` }}
        />
        <span
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500 ring-2 ring-white"
          style={{ left: `${subject}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between gap-3 text-xs text-subtle">
        <span>მინ. {format(stats.min)}</span>
        <span>მაქს. {format(stats.max)}</span>
      </div>
      <p aria-hidden="true" className="mt-1 flex flex-wrap gap-x-4 text-xs text-subtle">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-accent-500" />
          ეს განცხადება
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-navy" />
          მედიანა
        </span>
      </p>
    </div>
  );
}
