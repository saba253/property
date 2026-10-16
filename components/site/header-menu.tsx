"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useRef } from "react";
import { useDismissableDetails } from "@/components/ui/use-dismissable-details";

export type HeaderMenuItem = { href: string; label: string; description?: string };

/**
 * Compact header menu ("მენიუ"): a native <details> with links, so the header stays on one line
 * at 375px while every section stays reachable. Escape, a click outside or following a link
 * closes it.
 */
export function HeaderMenu({
  items,
  account,
}: {
  items: readonly HeaderMenuItem[];
  /** Account entry shown first (sign-in, or the account links). */
  account?: ReactNode;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  useDismissableDetails(detailsRef);

  return (
    // The key closes the menu after navigation.
    <details key={pathname} ref={detailsRef} className="group relative">
      <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-1.5 rounded-full px-2.5 text-sm font-medium text-navy transition-colors hover:bg-cream group-open:bg-cream sm:px-3 [&::-webkit-details-marker]:hidden">
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5 fill-current">
          <path d="M3 5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm0 5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm1 4a1 1 0 1 0 0 2h12a1 1 0 1 0 0-2H4Z" />
        </svg>
        <span className="sr-only sm:not-sr-only">მენიუ</span>
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-2 shadow-card-hover">
        {account && <div className="mb-1 border-b border-line pb-1">{account}</div>}
        <ul aria-label="ნავიგაცია">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                onClick={() => {
                  if (detailsRef.current) detailsRef.current.open = false;
                }}
                className={`block rounded-xl px-3 py-2.5 transition-colors hover:bg-cream ${
                  pathname === item.href ? "bg-cream" : ""
                }`}
              >
                <span className="block text-sm font-semibold text-navy">{item.label}</span>
                {item.description && (
                  <span className="mt-0.5 block text-xs text-muted">{item.description}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-1 border-t border-line px-3 pt-2 pb-1 text-xs text-amber-900">
          პლატფორმა მუშავდება · ყველა განცხადება დემოა
        </p>
      </div>
    </details>
  );
}
