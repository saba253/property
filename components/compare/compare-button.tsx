"use client";

import { useCompareActions, useIsCompared } from "@/components/compare/compare-state";

export const COMPARE_LABELS = {
  add: "შედარებაში დამატება",
  remove: "შედარებიდან ამოშლა",
} as const;

export function CompareIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={`${className} fill-current`}>
      <path d="M3 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4Zm2 1v10h2V5H5Zm6-1a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V4Zm2 1v10h2V5h-2Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-current">
      <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" />
    </svg>
  );
}

type CompareButtonProps = {
  listingId: string;
  title: string;
  /** "chip": small pill (cards, result rows, previews). "inline": larger (detail page). */
  variant?: "chip" | "inline";
  className?: string;
};

/**
 * Adds a listing to (or removes it from) the comparison. A native toggle button with
 * aria-pressed, placed next to the listing link (never inside it). It is a text pill with a
 * "columns" icon, clearly different from the round heart of favorites; the selected state is
 * shown by a check mark and text, not by color alone. Refusals (full, mixed sale/rent) appear in
 * the comparison tray.
 */
export function CompareButton({
  listingId,
  title,
  variant = "chip",
  className = "",
}: CompareButtonProps) {
  const selected = useIsCompared(listingId);
  const { add, remove } = useCompareActions();
  const action = selected ? COMPARE_LABELS.remove : COMPARE_LABELS.add;
  const size = variant === "inline" ? "h-10 px-4 text-sm" : "h-9 px-3 text-xs";

  return (
    <button
      type="button"
      onClick={() => (selected ? remove(listingId) : add(listingId))}
      aria-pressed={selected}
      aria-label={`${action}: ${title}`}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 ${size} ${
        selected
          ? "border-accent-700 bg-accent-50 text-accent-700"
          : "border-line-strong bg-surface text-navy hover:border-navy"
      } ${className}`}
    >
      {selected ? <CheckIcon /> : <CompareIcon />}
      {/* Fixed width, so the button keeps its size when the text changes. */}
      <span className="inline-block w-[5.5rem] text-left">
        {selected ? "შედარებაშია" : "შედარება"}
      </span>
    </button>
  );
}
