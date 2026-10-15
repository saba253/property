"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CompareIcon } from "@/components/compare/compare-button";
import { useComparison } from "@/components/compare/compare-state";

/**
 * Header link to /compare with the number of selected listings. The count appears only after
 * hydration (the server renders none), so server and client markup match. Text from `lg`.
 */
export function HeaderCompareLink() {
  const { available } = useComparison();
  const active = usePathname() === "/compare";
  // Selected listings, minus any the server reported as no longer available.
  const count = available.length;

  return (
    <Link
      href="/compare"
      aria-current={active ? "page" : undefined}
      aria-label={count > 0 ? `შედარება, არჩეულია ${count}` : "შედარება"}
      className={`relative inline-flex h-10 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium whitespace-nowrap text-navy transition-colors hover:bg-cream xl:px-3 ${
        active ? "bg-cream" : ""
      }`}
    >
      <CompareIcon className="h-5 w-5" />
      <span className="hidden xl:inline">შედარება</span>
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 min-w-5 rounded-full bg-accent-700 px-1 text-center text-[11px] leading-5 font-semibold text-white xl:static xl:ml-0.5"
        >
          {count}
        </span>
      )}
    </Link>
  );
}
