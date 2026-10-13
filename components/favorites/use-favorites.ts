"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  type FavoritesSnapshot,
  type FavoritesStore,
  createFavoritesStore,
} from "@/lib/favorites/favorites-store";

let store: FavoritesStore | null = null;

/** The single favorites store of this browser tab, created on first use. */
function getStore(): FavoritesStore {
  if (!store) {
    // Accessing window.localStorage can itself throw (blocked site data); the store handles it.
    store = createFavoritesStore(() =>
      typeof window === "undefined" ? null : window.localStorage,
    );
    if (typeof window !== "undefined") {
      const shared = store;
      window.addEventListener("storage", (event) => {
        if (event.storageArea === null || event.storageArea === window.localStorage) {
          shared.handleStorageChange(event.key, event.newValue);
        }
      });
    }
  }
  return store;
}

const subscribe = (listener: () => void) => getStore().subscribe(listener);

/**
 * All saved ids and the storage status. The server and the first (hydration) render use an empty
 * "loading" snapshot, so markup always matches; the saved state appears right after hydration.
 */
export function useFavorites(): FavoritesSnapshot & {
  toggle: (id: string) => void;
  remove: (id: string) => void;
} {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => getStore().getSnapshot(),
    () => getStore().getServerSnapshot(),
  );
  const toggle = useCallback((id: string) => getStore().toggle(id), []);
  const remove = useCallback((id: string) => getStore().remove(id), []);
  return { ...snapshot, toggle, remove };
}

/**
 * Whether one listing is saved. Selects a boolean, so a heart button re-renders only when its
 * own listing changes, not when another listing is saved.
 */
export function useIsFavorite(listingId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => getStore().getSnapshot().ids.includes(listingId),
    () => false,
  );
}

export function toggleFavorite(listingId: string) {
  getStore().toggle(listingId);
}
