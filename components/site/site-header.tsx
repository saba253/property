import Link from "next/link";
import { HeaderFavoritesLink } from "@/components/favorites/header-favorites-link";
import { Logo } from "@/components/site/logo";
import { pageContainer } from "@/components/ui/styles";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
      <div className={`${pageContainer} flex h-16 items-center justify-between gap-3`}>
        <Logo />

        <nav aria-label="მთავარი ნავიგაცია" className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/properties"
            className="rounded-full px-2.5 py-2 text-sm font-medium whitespace-nowrap text-navy transition-colors hover:bg-cream sm:px-3"
          >
            {/* Shorter on phones so the header stays on one line; pages keep their demo labels. */}
            <span className="sm:hidden">განცხადებები</span>
            <span className="hidden sm:inline">დემო განცხადებები</span>
          </Link>
          <HeaderFavoritesLink />
          <Link
            href="/properties/new"
            className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-2.5 py-2 text-sm font-medium whitespace-nowrap text-navy transition-colors hover:border-navy"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-current">
              <path d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1Z" />
            </svg>
            <span className="lg:hidden">დამატება</span>
            <span className="hidden lg:inline">განცხადების დამატება</span>
          </Link>
          <span className="hidden rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 lg:inline">
            მუშავდება
          </span>
        </nav>
      </div>
    </header>
  );
}
