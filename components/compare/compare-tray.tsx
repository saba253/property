"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { CompareIcon } from "@/components/compare/compare-button";
import { ensureSummaries, useComparison } from "@/components/compare/compare-state";
import { ListingImageView, NoImagesPlaceholder } from "@/components/gallery/listing-image";
import { MAX_COMPARE, MIN_COMPARE, getComparisonReadiness } from "@/lib/compare/compare-selection";
import { buildComparePageHref } from "@/lib/compare/selection-urls";

/**
 * Compact comparison bar fixed to the bottom of the screen while at least one listing is selected.
 * It reserves its own height at the bottom of the page (CSS variable --compare-tray-space), so it
 * never covers content, the map attribution or the map's own controls. Not shown on /compare.
 */
export function CompareTray() {
  const { available, summaries, status, notice, remove, clear, dismissNotice, lookup } =
    useComparison();
  const pathname = usePathname();
  const trayRef = useRef<HTMLDivElement>(null);
  const visible = status !== "loading" && available.length > 0 && pathname !== "/compare";
  // Readiness needs every selected listing's transaction type (loaded from the lookup endpoint).
  const loaded = available.every((id) => summaries.byId.has(id));
  const readiness = loaded ? getComparisonReadiness(available, lookup) : null;

  useEffect(() => {
    const root = document.documentElement;
    const tray = trayRef.current;
    if (!visible || !tray) {
      root.style.setProperty("--compare-tray-space", "0px");
      return;
    }
    const observer = new ResizeObserver(() => {
      root.style.setProperty("--compare-tray-space", `${tray.offsetHeight}px`);
    });
    observer.observe(tray);
    return () => {
      observer.disconnect();
      root.style.setProperty("--compare-tray-space", "0px");
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      ref={trayRef}
      role="region"
      aria-label="შედარება"
      className="fixed inset-x-0 bottom-0 z-[1200] border-t border-line bg-surface/95 shadow-[0_-4px_20px_rgb(23_43_70/0.1)] backdrop-blur"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-2 sm:px-6 sm:py-2.5 lg:px-8">
        {notice && (
          <div
            role="alert"
            className="mb-2 flex items-start justify-between gap-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200"
          >
            <p>{notice}</p>
            <button
              type="button"
              onClick={dismissNotice}
              aria-label="შეტყობინების დახურვა"
              className="-my-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-amber-100"
            >
              ×
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:gap-x-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-navy">
            <CompareIcon />
            შედარება
            <span className="font-normal text-muted">
              {available.length} / {MAX_COMPARE}
            </span>
          </p>

          <ul aria-label="შედარებისთვის არჩეული" className="flex items-center gap-2">
            {available.map((id) => {
              const entry = summaries.byId.get(id);
              if (!entry) {
                // Still loading (or the lookup failed): a neutral placeholder, never a guess.
                return (
                  <li key={id}>
                    <span className="block h-8 w-11 animate-pulse rounded-lg bg-line sm:h-10 sm:w-14" />
                  </li>
                );
              }
              return (
                <li key={id} className="relative">
                  <Link href={entry.href} title={entry.title} className="block rounded-lg">
                    {entry.coverImage ? (
                      <ListingImageView
                        image={entry.coverImage}
                        decorative
                        label={null}
                        className="h-8 w-11 rounded-lg sm:h-10 sm:w-14"
                      />
                    ) : (
                      <span className="block h-8 w-11 overflow-hidden rounded-lg sm:h-10 sm:w-14">
                        <NoImagesPlaceholder compact className="h-full w-full [&_p]:hidden" />
                      </span>
                    )}
                    <span className="sr-only">{entry.title}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => remove(id)}
                    aria-label={`შედარებიდან ამოშლა: ${entry.title}`}
                    className="absolute -top-2 -right-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-navy text-xs text-white ring-2 ring-white hover:bg-navy-900"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="ml-auto flex items-center gap-2">
            {status === "memory-only" && (
              <span className="text-xs text-amber-900">დროებით: ბრაუზერი არ ინახავს</span>
            )}
            <button
              type="button"
              onClick={clear}
              className="h-9 rounded-full px-3 text-sm font-medium text-navy hover:bg-cream"
            >
              გასუფთავება
            </button>
            {readiness?.ready ? (
              <Link
                href={buildComparePageHref(available)}
                className="inline-flex h-9 items-center rounded-full bg-navy px-4 text-sm font-semibold text-white hover:bg-navy-900"
              >
                შედარება
              </Link>
            ) : (
              <button
                type="button"
                disabled
                aria-describedby="compare-tray-hint"
                className="inline-flex h-9 cursor-not-allowed items-center rounded-full bg-navy/40 px-4 text-sm font-semibold text-white"
              >
                შედარება
              </button>
            )}
          </div>
        </div>
        {!readiness?.ready && (
          <p id="compare-tray-hint" className="mt-0.5 text-xs text-muted">
            {readiness === null ? (
              summaries.failed ? (
                <>
                  არჩეული განცხადებების ჩატვირთვა ვერ მოხერხდა.{" "}
                  <button
                    type="button"
                    onClick={() => void ensureSummaries(available)}
                    className="font-semibold text-accent-700 underline-offset-4 hover:underline"
                  >
                    თავიდან ცდა
                  </button>
                </>
              ) : (
                "იტვირთება…"
              )
            ) : readiness.reason === "too-few" ? (
              `შესადარებლად აირჩიეთ მინიმუმ ${MIN_COMPARE} განცხადება.`
            ) : (
              "გასაყიდი და გასაქირავებელი განცხადებები ერთად ვერ შედარდება."
            )}
          </p>
        )}
      </div>
    </div>
  );
}
