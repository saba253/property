import Link from "next/link";
import { TRANSACTION_TYPES, TRANSACTION_TYPE_ORDER } from "@/lib/properties/listing-types";
import type { TransactionType } from "@/lib/properties/types";

type TransactionTabsProps = {
  current: TransactionType;
  hrefFor: Record<TransactionType, string>;
};

/**
 * "For Sale | For Rent" tabs. Plain links, so they work without JavaScript and every state has
 * a shareable URL. There is deliberately no "all" tab: sale prices and monthly rents are
 * different kinds of price and are never listed or budgeted together.
 */
export function TransactionTabs({ current, hrefFor }: TransactionTabsProps) {
  return (
    <nav aria-label="გარიგების ტიპი">
      <ul className="inline-flex rounded-full border border-line-strong bg-surface p-1">
        {TRANSACTION_TYPE_ORDER.map((type) => {
          const active = type === current;
          return (
            <li key={type}>
              <Link
                href={hrefFor[type]}
                aria-current={active ? "page" : undefined}
                scroll={false}
                className={`inline-flex h-10 items-center rounded-full px-5 text-base font-semibold transition-colors ${
                  active ? "bg-navy text-white" : "text-navy hover:bg-cream"
                }`}
              >
                {TRANSACTION_TYPES[type].label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
