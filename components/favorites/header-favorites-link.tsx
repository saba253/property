"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HeartIcon } from "@/components/favorites/favorite-button";
import { useFavorites } from "@/components/favorites/use-favorites";

/**
 * Header link to /favorites. The count of saved ids appears after hydration (the server always
 * renders it without a count), so server and client markup match. On phones only the heart shows.
 */
export function HeaderFavoritesLink() {
  const { ids } = useFavorites();
  const active = usePathname() === "/favorites";
  const count = ids.length;

  return (
    <Link
      href="/favorites"
      aria-current={active ? "page" : undefined}
      aria-label={count > 0 ? `რჩეულები, შენახულია ${count}` : "რჩეულები"}
      className={`relative inline-flex h-10 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium whitespace-nowrap text-navy transition-colors hover:bg-cream xl:px-3 ${
        active ? "bg-cream" : ""
      }`}
    >
      <HeartIcon filled={count > 0} className="h-5 w-5" />
      <span className="hidden xl:inline">რჩეულები</span>
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 min-w-5 rounded-full bg-navy px-1 text-center text-[11px] leading-5 font-semibold text-white xl:static xl:ml-0.5"
        >
          {count}
        </span>
      )}
    </Link>
  );
}
