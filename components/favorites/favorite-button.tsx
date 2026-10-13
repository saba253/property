"use client";

import { toggleFavorite, useIsFavorite } from "@/components/favorites/use-favorites";

export const FAVORITE_LABELS = {
  add: "რჩეულებში დამატება",
  remove: "რჩეულებიდან ამოშლა",
} as const;

export function HeartIcon({
  filled,
  className = "h-5 w-5",
}: {
  filled: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <path d="M12 20.3s-7.5-4.5-9.4-9.3C1.4 7.9 3.4 4.5 6.8 4.2c2-.2 3.7.9 5.2 2.9 1.5-2 3.2-3.1 5.2-2.9 3.4.3 5.4 3.7 4.2 6.8-1.9 4.8-9.4 9.3-9.4 9.3Z" />
    </svg>
  );
}

type FavoriteButtonProps = {
  listingId: string;
  /** Listing title, so screen reader users know which listing the button belongs to. */
  title: string;
  /**
   * "overlay": round button over a card image. "inline": button with text (detail page).
   * "compact": small round button for result rows and map previews.
   */
  variant?: "overlay" | "inline" | "compact";
  className?: string;
};

/**
 * Heart toggle for saving a listing in this browser. A native button with aria-pressed and a
 * Georgian label that says what pressing it will do. It is always placed next to (never inside)
 * the listing link, so it never triggers navigation. Saved state is shown by the filled heart
 * and, for the inline variant, by text, not by color alone. The size never changes on toggle.
 */
export function FavoriteButton({
  listingId,
  title,
  variant = "overlay",
  className = "",
}: FavoriteButtonProps) {
  const saved = useIsFavorite(listingId);
  const action = saved ? FAVORITE_LABELS.remove : FAVORITE_LABELS.add;
  const common =
    "inline-flex shrink-0 items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500";

  if (variant === "inline") {
    return (
      <button
        type="button"
        onClick={() => toggleFavorite(listingId)}
        aria-pressed={saved}
        aria-label={`${action}: ${title}`}
        className={`${common} h-10 gap-2 rounded-full border px-4 text-sm font-semibold ${
          saved
            ? "border-navy bg-navy text-white hover:bg-navy-900"
            : "border-line-strong bg-surface text-navy hover:border-navy"
        } ${className}`}
      >
        <HeartIcon filled={saved} />
        {/* Fixed width, so the button does not change size when the text changes. */}
        <span className="inline-block w-[4.5rem] text-left">{saved ? "შენახულია" : "შენახვა"}</span>
      </button>
    );
  }

  const size = variant === "compact" ? "h-9 w-9" : "h-10 w-10";
  return (
    <button
      type="button"
      onClick={() => toggleFavorite(listingId)}
      aria-pressed={saved}
      aria-label={`${action}: ${title}`}
      title={action}
      className={`${common} ${size} rounded-full ${
        variant === "overlay"
          ? "bg-white/95 shadow-card hover:bg-white"
          : "border border-line-strong bg-surface hover:border-navy"
      } ${saved ? "text-navy" : "text-navy/80 hover:text-navy"} ${className}`}
    >
      <HeartIcon filled={saved} className={variant === "compact" ? "h-4.5 w-4.5" : "h-5 w-5"} />
    </button>
  );
}
