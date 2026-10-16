"use client";

import Link from "next/link";
import { useRef } from "react";
import { useDismissableDetails } from "@/components/ui/use-dismissable-details";
import { SORT_OPTIONS, type SortOption, sortLabel } from "@/lib/properties/listing-sort";

type SortMenuProps = {
  current: SortOption;
  /** The options to offer (rentals have no price-per-m² sorting). */
  options?: readonly { value: SortOption; label: string }[];
  /** Link for every option, keeping all other search parameters. */
  hrefFor: Record<SortOption, string>;
};

/**
 * Compact "დალაგება" menu next to the results count. A native <details> with plain links: it works
 * without JavaScript, every option is a normal link (shareable `sort` URL), and moving through
 * the options with the keyboard does not reload the page. Escape and a click outside close it.
 */
export function SortMenu({ current, hrefFor, options = SORT_OPTIONS }: SortMenuProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useDismissableDetails(detailsRef);

  return (
    <details ref={detailsRef} className="group relative max-w-full min-w-0">
      <summary className="inline-flex h-9 max-w-full cursor-pointer list-none items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-sm text-navy transition-colors hover:border-navy [&::-webkit-details-marker]:hidden">
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 shrink-0 fill-current">
          <path d="M6 3a1 1 0 0 1 .7.3l3 3a1 1 0 0 1-1.4 1.4L7 6.4V16a1 1 0 1 1-2 0V6.4L3.7 7.7a1 1 0 0 1-1.4-1.4l3-3A1 1 0 0 1 6 3Zm8 0a1 1 0 0 1 1 1v9.6l1.3-1.3a1 1 0 0 1 1.4 1.4l-3 3a1 1 0 0 1-1.4 0l-3-3a1 1 0 0 1 1.4-1.4l1.3 1.3V4a1 1 0 0 1 1-1Z" />
        </svg>
        <span className="shrink-0 text-muted">დალაგება:</span>
        <span className="min-w-0 truncate font-semibold">{sortLabel(current)}</span>
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="h-4 w-4 shrink-0 fill-current transition-transform group-open:rotate-180"
        >
          <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" />
        </svg>
      </summary>
      <ul
        aria-label="დალაგების ვარიანტები"
        className="absolute right-0 z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-1.5 shadow-card-hover max-lg:fixed max-lg:inset-x-4 max-lg:top-auto max-lg:bottom-4 max-lg:z-[1300] max-lg:mx-auto max-lg:mt-0 max-lg:w-auto max-lg:max-w-md"
      >
        {options.map((option) => {
          const active = option.value === current;
          return (
            <li key={option.value}>
              <Link
                href={hrefFor[option.value]}
                scroll={false}
                aria-current={active ? "true" : undefined}
                onClick={() => {
                  if (detailsRef.current) detailsRef.current.open = false;
                }}
                className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                  active ? "bg-cream font-semibold text-navy" : "text-ink hover:bg-cream/70"
                }`}
              >
                {option.label}
                {active && (
                  <svg
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 fill-navy"
                  >
                    <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" />
                  </svg>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
