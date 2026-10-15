"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { HeartIcon } from "@/components/favorites/favorite-button";
import { useFavorites } from "@/components/favorites/use-favorites";
import { SelectionUrlSync } from "@/components/storage/selection-url-sync";
import { buttonPrimary } from "@/components/ui/styles";
import { splitRequestedFavorites } from "@/lib/favorites/favorites";

export type FavoriteCard = {
  id: string;
  /** The listing card, rendered on the server with the shared ListingCard component. */
  card: ReactNode;
};

/**
 * Shows the saved listings (newest saved first). The server renders cards only for the ids in the
 * URL (`requestedIds`), which SelectionUrlSync keeps equal to the ids saved in this browser.
 * Removing a heart updates the list at once. Saved ids the server could not find (removed or
 * inactive listings) are reported and can be cleared; ids not requested yet are still loading.
 */
export function FavoritesGrid({
  cards,
  requestedIds,
}: {
  cards: readonly FavoriteCard[];
  requestedIds: readonly string[];
}) {
  const { ids, status, remove } = useFavorites();
  const byId = new Map(cards.map((item) => [item.id, item.card]));
  const { available, missing, pending } = splitRequestedFavorites(
    ids,
    requestedIds,
    cards.map((item) => item.id),
  );
  const sync = <SelectionUrlSync ids={ids} status={status} requestedIds={requestedIds} />;

  if (status === "loading" || (pending && available.length === 0)) {
    return (
      <p role="status" className="mt-8 text-sm text-muted">
        რჩეულები იტვირთება…
        {sync}
      </p>
    );
  }

  return (
    <div className="mt-6">
      {sync}
      {status === "memory-only" && (
        <p
          role="note"
          className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900"
        >
          ბრაუზერი ამ საიტისთვის მონაცემების შენახვას არ იძლევა, ამიტომ რჩეულები მხოლოდ დროებითაა და
          გვერდის განახლებისას დაიკარგება.
        </p>
      )}

      {missing.length > 0 && (
        <div
          role="note"
          className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-cream px-4 py-3 text-sm text-navy"
        >
          <span>{missing.length} შენახული განცხადება აღარ არის ხელმისაწვდომი.</span>
          <button
            type="button"
            onClick={() => missing.forEach(remove)}
            className="font-semibold text-accent-700 underline-offset-4 hover:underline"
          >
            სიიდან ამოშლა
          </button>
        </div>
      )}

      <p role="status" className="text-base font-semibold text-ink">
        {available.length > 0
          ? `შენახულია ${available.length} განცხადება`
          : "რჩეულებში ჯერ არაფერი გაქვს დამატებული."}
      </p>

      {available.length > 0 ? (
        <ul className="mt-5 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {available.map((id) => (
            <li key={id}>{byId.get(id)}</li>
          ))}
        </ul>
      ) : (
        <div className="mt-5 rounded-card border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-cream text-navy">
            <HeartIcon filled={false} className="h-7 w-7" />
          </span>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted">
            დააჭირეთ გულის ნიშანს განცხადების ბარათზე ან განცხადების გვერდზე და ის აქ გამოჩნდება.
          </p>
          <Link href="/properties" className={`${buttonPrimary} mt-6`}>
            განცხადებების ნახვა
          </Link>
        </div>
      )}
    </div>
  );
}
