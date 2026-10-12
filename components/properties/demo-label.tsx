import type { ReactNode } from "react";

/** Small amber pill that marks demo content. Amber is reserved for demo labels and warnings. */
export function DemoBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-300 ${className}`}
    >
      დემო
    </span>
  );
}

/** Amber banner explaining that the content on the page is invented. */
export function DemoNotice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      role="note"
      className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"
    >
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        className="mt-0.5 h-5 w-5 shrink-0 fill-amber-600"
      >
        <path d="M10 1.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm0 4a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-4a1 1 0 0 1 1-1Zm0 7.25a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z" />
      </svg>
      <p>
        <strong className="font-semibold">{title}</strong> {children}
      </p>
    </div>
  );
}

/** One-line demo disclosure for search results: always visible, but compact. */
export function DemoDisclosure() {
  return (
    <p
      role="note"
      className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-sm text-amber-900 ring-1 ring-amber-200"
    >
      <span className="font-semibold">დემო</span>
      <span>ყველა განცხადება, ფასი და ილუსტრაცია გამოგონილია.</span>
    </p>
  );
}
