import Link from "next/link";
import type { Currency } from "@/lib/properties/types";

const OPTIONS: readonly { currency: Currency; label: string }[] = [
  { currency: "USD", label: "$ USD" },
  { currency: "GEL", label: "₾ GEL" },
];

type CurrencyToggleProps = {
  current: Currency;
  hrefFor: Record<Currency, string>;
};

/** Segmented control for the display currency. Plain links, so it works without JavaScript. */
export function CurrencyToggle({ current, hrefFor }: CurrencyToggleProps) {
  return (
    <nav aria-label="ფასების ჩვენების ვალუტა" className="inline-flex items-center gap-2">
      <span className="text-sm text-muted">ვალუტა:</span>
      <ul className="inline-flex rounded-full border border-line-strong bg-surface p-1">
        {OPTIONS.map(({ currency, label }) => {
          const active = currency === current;
          return (
            <li key={currency}>
              <Link
                href={hrefFor[currency]}
                aria-current={active ? "true" : undefined}
                scroll={false}
                className={`inline-flex h-8 items-center rounded-full px-3 text-sm font-semibold transition-colors ${
                  active ? "bg-navy text-white" : "text-navy hover:bg-cream"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
