"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CurrencyToggle } from "@/components/currency/currency-toggle";
import { PricePerSqmCallout } from "@/components/properties/price-per-sqm";
import { buttonSecondary } from "@/components/ui/styles";
import type { DisplayPrice } from "@/lib/pricing/display-price";
import {
  formatDisplayAmount,
  formatDisplayPricePerSqm,
  originalPriceNote,
} from "@/lib/pricing/format-display-price";
import { formatArea, formatMoney, formatPricePerSqm } from "@/lib/pricing/format-money";
import { buildListingDetailHref, buildListingsHref } from "@/lib/properties/filter-chips";
import { parseDisplayCurrency } from "@/lib/properties/listing-filters";
import type { Currency } from "@/lib/properties/types";

/*
 * The detail page is fully static (so unknown ids can return HTTP 404), which means the server
 * cannot read ?display=. Both currencies are computed on the server from one rate snapshot and
 * passed in; these components only pick one, based on the URL. Each "View" renders without
 * hooks and doubles as the Suspense fallback, which shows the default (USD).
 */

export type PricesByCurrency = Record<Currency, DisplayPrice>;

function useDisplayCurrency(): Currency {
  const value = useSearchParams().get("display");
  return parseDisplayCurrency(value ? { display: value } : {}).display;
}

type SummaryProps = { listingId: string; prices: PricesByCurrency };

export function DetailPriceSummaryView({
  listingId,
  prices,
  display,
}: SummaryProps & { display: Currency }) {
  const price = prices[display];
  const pricePerSqm = formatDisplayPricePerSqm(price);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">განცხადებაში მითითებული ფასი</p>
        <CurrencyToggle
          current={display}
          hrefFor={{
            USD: buildListingDetailHref(listingId, "USD"),
            GEL: buildListingDetailHref(listingId, "GEL"),
          }}
        />
      </div>
      <p className="mt-2 text-3xl font-bold text-ink">{formatDisplayAmount(price)}</p>
      <p className="mt-1 text-xs text-subtle">{originalPriceNote(price)}</p>

      {pricePerSqm && (
        <div className="mt-5">
          <PricePerSqmCallout
            text={pricePerSqm}
            note={
              price.isConverted
                ? "ავტომატურად გამოითვლება · სავარაუდო, ოფიციალური კურსით"
                : "ავტომატურად გამოითვლება"
            }
          />
        </div>
      )}

      <Link href={buildListingsHref({}, display)} className={`${buttonSecondary} mt-5 w-full`}>
        სხვა დემო განცხადებები
      </Link>
    </>
  );
}

export function DetailPriceSummary(props: SummaryProps) {
  return <DetailPriceSummaryView {...props} display={useDisplayCurrency()} />;
}

type FormulaProps = { prices: PricesByCurrency; areaSqm: number };

export function DetailPriceFormulaView({
  prices,
  areaSqm,
  display,
}: FormulaProps & { display: Currency }) {
  // Without a rate the converted price is missing, so the formula falls back to the original.
  const price = prices[display];
  const original = price.original;
  const sameCurrency = prices[original.currency];
  const formula =
    price.amount !== null && price.pricePerSqm !== null
      ? {
          amount: formatDisplayAmount(price),
          result: formatPricePerSqm(price.pricePerSqm, display),
        }
      : {
          amount: formatMoney(original.amount, original.currency),
          result: formatPricePerSqm(sameCurrency.pricePerSqm ?? 0, original.currency),
        };

  return (
    <>
      <p className="mt-3 rounded-2xl border border-line bg-surface p-4 text-base font-medium text-ink">
        {formula.amount} ÷ {formatArea(areaSqm)} ={" "}
        <span className="text-accent-700">{formula.result}</span>
      </p>
      {price.isConverted && (
        <p className="mt-2 text-sm text-muted">
          ორიგინალი ფასი {formatMoney(original.amount, original.currency)} ({original.currency})
          გადაყვანილია {display}-ში ეროვნული ბანკის ოფიციალური კურსით და დამრგვალებულია მთელ
          ერთეულამდე.
        </p>
      )}
    </>
  );
}

export function DetailPriceFormula(props: FormulaProps) {
  return <DetailPriceFormulaView {...props} display={useDisplayCurrency()} />;
}

export function BackToListingsLinkView({ display }: { display: Currency }) {
  return (
    <Link
      href={buildListingsHref({}, display)}
      className="inline-flex items-center gap-1 rounded-full text-sm font-medium text-muted hover:text-ink"
    >
      ← დემო განცხადებები
    </Link>
  );
}

export function BackToListingsLink() {
  return <BackToListingsLinkView display={useDisplayCurrency()} />;
}
