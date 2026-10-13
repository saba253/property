import Link from "next/link";
import type { ListingsView } from "@/lib/properties/listings-view";

const OPTIONS: readonly { view: ListingsView; label: string; icon: string }[] = [
  {
    view: "list",
    label: "სია",
    icon: "M3 5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm0 5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm1 4a1 1 0 1 0 0 2h12a1 1 0 1 0 0-2H4Z",
  },
  {
    view: "map",
    label: "რუქა",
    icon: "M7.3 3.1a1 1 0 0 1 .8 0l4.4 1.8 4.1-1.7A1 1 0 0 1 18 4v11a1 1 0 0 1-.6.9l-4.5 1.9a1 1 0 0 1-.8 0L7.7 16l-4.1 1.7A1 1 0 0 1 2 16.8V6a1 1 0 0 1 .6-.9l4.7-2ZM8 5.4v9.2l4 1.6V7l-4-1.6Z",
  },
];

/**
 * "სია | რუქა" switch. Plain links that keep every search parameter, so the choice is shareable
 * (view=map) and works without JavaScript and with the keyboard.
 */
export function ViewToggle({
  current,
  hrefFor,
}: {
  current: ListingsView;
  hrefFor: Record<ListingsView, string>;
}) {
  return (
    <nav aria-label="შედეგების ხედი">
      <ul className="inline-flex rounded-full border border-line-strong bg-surface p-1">
        {OPTIONS.map(({ view, label, icon }) => {
          const active = view === current;
          return (
            <li key={view}>
              <Link
                href={hrefFor[view]}
                aria-current={active ? "page" : undefined}
                scroll={false}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors ${
                  active ? "bg-navy text-white" : "text-navy hover:bg-cream"
                }`}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-current">
                  <path d={icon} />
                </svg>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
