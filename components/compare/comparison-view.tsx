"use client";

import Link from "next/link";
import { CompareIcon } from "@/components/compare/compare-button";
import { useComparison } from "@/components/compare/compare-state";
import { ListingImageView, NoImagesPlaceholder } from "@/components/gallery/listing-image";
import { buttonPrimary } from "@/components/ui/styles";
import {
  MAX_COMPARE,
  MIN_COMPARE,
  getComparisonReadiness,
  pruneComparison,
} from "@/lib/compare/compare-selection";
import {
  CELL_TEXT,
  type CompareCell,
  type ComparisonColumn,
  type ComparisonRowKey,
  type Extremes,
  ROW_GROUP_LABELS,
  findExtremes,
  visibleRows,
} from "@/lib/compare/comparison";

/** Neutral labels for the lowest/highest numbers; they are not "best" or "worst". */
const EXTREME_LABELS: Partial<Record<ComparisonRowKey, { lowest: string; highest: string }>> = {
  price: { lowest: "ყველაზე დაბალი", highest: "ყველაზე მაღალი" },
  pricePerSqm: { lowest: "ყველაზე დაბალი", highest: "ყველაზე მაღალი" },
  area: { lowest: "ყველაზე პატარა", highest: "ყველაზე დიდი" },
};

function Cell({ cell }: { cell: CompareCell }) {
  switch (cell.kind) {
    case "value":
      return <span className="text-ink">{cell.text}</span>;
    case "unknown":
      return <span className="text-sm text-subtle">{CELL_TEXT.unknown}</span>;
    case "not-applicable":
      return <span className="text-sm text-subtle italic">{CELL_TEXT["not-applicable"]}</span>;
    case "amenity":
      if (cell.status === "yes") {
        return (
          <span className="inline-flex items-center gap-1.5 font-medium text-navy">
            <span aria-hidden="true">✓</span>
            {CELL_TEXT.yes}
          </span>
        );
      }
      if (cell.status === "no") {
        return (
          <span className="inline-flex items-center gap-1.5 text-muted">
            <span aria-hidden="true">✕</span>
            {CELL_TEXT.no}
          </span>
        );
      }
      return <span className="text-sm text-subtle">{CELL_TEXT.unknown}</span>;
  }
}

function EmptyState({ selectedCount }: { selectedCount: number }) {
  return (
    <div className="mt-6 rounded-card border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-cream text-navy">
        <CompareIcon className="h-7 w-7" />
      </span>
      <p className="mt-4 text-base font-semibold text-navy">
        {selectedCount === 0
          ? "შედარებისთვის ჯერ არაფერია არჩეული."
          : `შესადარებლად აირჩიეთ მინიმუმ ${MIN_COMPARE} განცხადება.`}
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
        განცხადების ბარათზე ან გვერდზე დააჭირეთ „შედარება“-ს. შეგიძლიათ შეადაროთ {MIN_COMPARE}–
        {MAX_COMPARE} ერთი ტიპის განცხადება: ან მხოლოდ გასაყიდი, ან მხოლოდ გასაქირავებელი.
      </p>
      <Link href="/properties" className={`${buttonPrimary} mt-6`}>
        განცხადებების ნახვა
      </Link>
    </div>
  );
}

/**
 * The comparison table for the listings selected in this browser. Columns are prepared on the
 * server with the shared price and fact functions; this component only picks the selected ones,
 * hides rows that apply to none of them, and marks the lowest/highest numbers neutrally.
 */
export function ComparisonView({ columns }: { columns: readonly ComparisonColumn[] }) {
  const { ids, status, remove, clear, lookup } = useComparison();

  if (status === "loading") {
    return (
      <p role="status" className="mt-8 text-sm text-muted">
        შედარება იტვირთება…
      </p>
    );
  }

  const known = pruneComparison(ids, lookup);
  const readiness = getComparisonReadiness(known, lookup);
  const byId = new Map(columns.map((column) => [column.id, column]));
  let selected = known.map((id) => byId.get(id)).filter((column) => column !== undefined);
  const mixed = !readiness.ready && readiness.reason === "mixed-transaction";
  if (mixed && selected.length > 0) {
    // Only possible with edited storage: show one transaction type, never sale and rent together.
    selected = selected.filter((column) => column.transaction === selected[0].transaction);
  }

  if (selected.length < MIN_COMPARE) return <EmptyState selectedCount={selected.length} />;

  const rows = visibleRows(selected);
  const extremes: Partial<Record<ComparisonRowKey, Extremes | null>> = {
    price: findExtremes(selected, "price"),
    pricePerSqm: findExtremes(selected, "pricePerSqm"),
    area: findExtremes(selected, "area"),
  };
  const isRent = selected[0].transaction === "rent";

  return (
    <div className="mt-6">
      {mixed && (
        <p
          role="alert"
          className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          შედარებაში გასაყიდიც და გასაქირავებელიც იყო. ნაჩვენებია მხოლოდ ერთი ტიპის განცხადებები.
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-base font-semibold text-ink">
          შედარდება {selected.length} განცხადება
          {isRent && <span className="font-normal text-muted"> · თვიური ქირა</span>}
        </p>
        <div className="flex items-center gap-3">
          {status === "memory-only" && (
            <span className="text-xs text-amber-900">
              ბრაუზერი არჩევანს არ ინახავს: განახლებისას დაიკარგება.
            </span>
          )}
          <button
            type="button"
            onClick={clear}
            className="h-9 rounded-full border border-line-strong px-4 text-sm font-medium text-navy hover:border-navy"
          >
            შედარების გასუფთავება
          </button>
        </div>
      </div>

      <p className="mb-2 text-xs text-muted sm:hidden" aria-hidden="true">
        ცხრილი გადაასრიალეთ გვერდზე →
      </p>
      <div
        role="region"
        aria-label="შედარების ცხრილი"
        tabIndex={0}
        className="overflow-x-auto rounded-card border border-line bg-surface focus-visible:outline-2 focus-visible:outline-accent-500"
      >
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            განცხადებების შედარება: ფასი, ფართი, ოთახები და მახასიათებლები
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 w-36 min-w-36 bg-cream p-3 text-left align-bottom text-xs font-semibold text-muted sm:w-48"
              >
                განცხადება
              </th>
              {selected.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className="min-w-[11rem] border-l border-line p-3 text-left align-top font-normal"
                >
                  <div className="relative">
                    {column.coverImage ? (
                      <ListingImageView
                        image={column.coverImage}
                        decorative
                        label={null}
                        className="aspect-[4/3] w-full rounded-xl"
                      />
                    ) : (
                      <NoImagesPlaceholder compact className="aspect-[4/3] w-full rounded-xl" />
                    )}
                    <span className="absolute top-2 left-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-300">
                      დემო
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(column.id)}
                      aria-label={`შედარებიდან ამოშლა: ${column.title}`}
                      className="absolute top-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-navy shadow-card hover:bg-white"
                    >
                      ×
                    </button>
                  </div>
                  <Link
                    href={column.href}
                    className="mt-2 block font-semibold text-navy underline-offset-4 hover:underline"
                  >
                    {column.title}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          {(["summary", "price", "facts", "characteristics"] as const).map((group) => {
            const groupRows = rows.filter((row) => row.group === group);
            if (groupRows.length === 0) return null;
            return (
              <tbody key={group}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={selected.length + 1}
                    className="bg-cream/70 px-3 py-2 text-left text-xs font-semibold tracking-wide text-navy"
                  >
                    {ROW_GROUP_LABELS[group]}
                  </th>
                </tr>
                {groupRows.map((row) => (
                  <tr key={row.key} className="border-t border-line">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-surface p-3 text-left text-xs font-medium text-muted"
                    >
                      {row.label}
                    </th>
                    {selected.map((column) => {
                      const extreme = extremes[row.key];
                      const labels = EXTREME_LABELS[row.key];
                      const tag =
                        extreme && labels
                          ? extreme.lowest.includes(column.id)
                            ? labels.lowest
                            : extreme.highest.includes(column.id)
                              ? labels.highest
                              : null
                          : null;
                      return (
                        <td key={column.id} className="border-l border-line p-3 align-top">
                          <Cell cell={column.cells[row.key]} />
                          {tag && (
                            <span className="mt-1 block w-fit rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-medium text-accent-700 ring-1 ring-accent-100">
                              {tag}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            );
          })}
          <tbody>
            <tr className="border-t border-line">
              <th scope="row" className="sticky left-0 z-10 bg-surface p-3" />
              {selected.map((column) => (
                <td key={column.id} className="border-l border-line p-3">
                  <Link
                    href={column.href}
                    className="text-sm font-semibold text-accent-700 underline-offset-4 hover:underline"
                  >
                    განცხადების ნახვა →
                  </Link>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
