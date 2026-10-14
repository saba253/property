import Link from "next/link";
import { HeaderCompareLink } from "@/components/compare/header-compare-link";
import { HeaderFavoritesLink } from "@/components/favorites/header-favorites-link";
import { HeaderMenu, type HeaderMenuItem } from "@/components/site/header-menu";
import { Logo } from "@/components/site/logo";
import { pageContainer } from "@/components/ui/styles";

/** Every section, also reachable from the compact menu on small screens. */
const MENU_ITEMS: readonly HeaderMenuItem[] = [
  { href: "/properties", label: "განცხადებების ძიება", description: "დემო განცხადებები" },
  { href: "/favorites", label: "რჩეული განცხადებები", description: "ინახება ამ ბრაუზერში" },
  { href: "/compare", label: "შედარება", description: "2–4 განცხადება გვერდიგვერდ" },
  { href: "/saved-searches", label: "შენახული ძიებები", description: "ინახება ამ ბრაუზერში" },
  { href: "/properties/new", label: "განცხადების დამატება", description: "დემო: არ ქვეყნდება" },
];

/**
 * One line at every width: search link, favorites and comparison (icons with counts; text from
 * `xl`), "add listing" from `lg`, and a compact menu with every section.
 */
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
          <HeaderCompareLink />
          <Link
            href="/properties/new"
            className="hidden items-center gap-1.5 rounded-full border border-line-strong px-3 py-2 text-sm font-medium whitespace-nowrap text-navy transition-colors hover:border-navy lg:inline-flex"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-current">
              <path d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1Z" />
            </svg>
            განცხადების დამატება
          </Link>
          <HeaderMenu items={MENU_ITEMS} />
        </nav>
      </div>
    </header>
  );
}
