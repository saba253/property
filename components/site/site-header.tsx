import Link from "next/link";
import { Logo } from "@/components/site/logo";
import { pageContainer } from "@/components/ui/styles";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
      <div className={`${pageContainer} flex h-16 items-center justify-between gap-3`}>
        <Logo />

        <nav aria-label="მთავარი ნავიგაცია" className="flex items-center gap-2">
          <Link
            href="/properties"
            className="rounded-full px-3 py-2 text-sm font-medium whitespace-nowrap text-navy transition-colors hover:bg-cream"
          >
            დემო განცხადებები
          </Link>
          <span className="hidden rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 sm:inline">
            მუშავდება
          </span>
        </nav>
      </div>
    </header>
  );
}
