import Link from "next/link";

/** Temporary wordmark. The final name and logo are not decided yet. */
export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 rounded-lg text-navy">
      <svg viewBox="0 0 32 32" aria-hidden="true" className="h-8 w-8 shrink-0">
        <rect width="32" height="32" rx="9" className="fill-navy" />
        {/* Roof line and three rising bars: a home and its numbers. */}
        <path
          d="M7 15 16 8l9 7"
          fill="none"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="10" y="18" width="3" height="6" rx="1" fill="white" />
        <rect x="14.5" y="15.5" width="3" height="8.5" rx="1" fill="white" />
        <rect x="19" y="13" width="3" height="11" rx="1" className="fill-sand-500" />
      </svg>
      <span className="sr-only text-lg font-bold tracking-tight whitespace-nowrap sm:not-sr-only">
        Property Intelligence
      </span>
    </Link>
  );
}
