import {
  FAVORITES_STORAGE_KEY,
  addFavorite,
  parseStoredFavorites,
  removeFavorite,
  serializeFavorites,
  toggleFavorite,
} from "@/lib/favorites/favorites";

/** The part of the Web Storage API the store needs (window.localStorage in the browser). */
export type FavoritesStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * - "loading": not read yet (always the case on the server and during hydration).
 * - "saved": stored in this browser's localStorage.
 * - "memory-only": localStorage is unavailable or refused the write; favorites last only until
 *   the page is closed or reloaded.
 */
export type FavoritesStatus = "loading" | "saved" | "memory-only";

export type FavoritesSnapshot = {
  readonly ids: readonly string[];
  readonly status: FavoritesStatus;
};

export type FavoritesStore = {
  /** For useSyncExternalStore: the same object until something changes. */
  getSnapshot: () => FavoritesSnapshot;
  /** Snapshot used on the server and during hydration, so both render the same markup. */
  getServerSnapshot: () => FavoritesSnapshot;
  subscribe: (listener: () => void) => () => void;
  add: (id: string) => void;
  remove: (id: string) => void;
  toggle: (id: string) => void;
  /** Applies a change made in another tab (from the browser's "storage" event). */
  handleStorageChange: (key: string | null, newValue: string | null) => void;
};

export const SERVER_SNAPSHOT: FavoritesSnapshot = Object.freeze({
  ids: Object.freeze([]) as readonly string[],
  status: "loading",
});

/**
 * One shared source of truth for saved listing ids. Every heart button, the header count and the
 * favorites page read the same store, so they always agree. Storage problems never throw: the
 * store falls back to memory and says so through `status`.
 *
 * `getStorage` is called lazily (only in the browser) and may throw, for example when site data
 * is blocked; that is treated as "no storage".
 */
export function createFavoritesStore(getStorage: () => FavoritesStorage | null): FavoritesStore {
  let snapshot: FavoritesSnapshot | null = null;
  let storage: FavoritesStorage | null = null;
  const listeners = new Set<() => void>();

  function load(): FavoritesSnapshot {
    try {
      storage = getStorage();
    } catch {
      storage = null;
    }
    if (!storage) return { ids: [], status: "memory-only" };
    try {
      return { ids: parseStoredFavorites(storage.getItem(FAVORITES_STORAGE_KEY)), status: "saved" };
    } catch {
      storage = null;
      return { ids: [], status: "memory-only" };
    }
  }

  function current(): FavoritesSnapshot {
    snapshot ??= load();
    return snapshot;
  }

  function publish(next: FavoritesSnapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function update(change: (ids: readonly string[]) => string[]) {
    const before = current();
    const ids = change(before.ids);
    if (ids.length === before.ids.length && ids.every((id, index) => id === before.ids[index])) {
      return;
    }
    let status = before.status;
    if (storage) {
      try {
        storage.setItem(FAVORITES_STORAGE_KEY, serializeFavorites(ids));
      } catch {
        // Quota exceeded or storage blocked: keep working in memory and say so.
        storage = null;
        status = "memory-only";
      }
    }
    publish({ ids, status });
  }

  return {
    getSnapshot: current,
    getServerSnapshot: () => SERVER_SNAPSHOT,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    add: (id) => update((ids) => addFavorite(ids, id)),
    remove: (id) => update((ids) => removeFavorite(ids, id)),
    toggle: (id) => update((ids) => toggleFavorite(ids, id)),
    handleStorageChange(key, newValue) {
      // key === null means another tab cleared all storage for this site.
      if (key !== null && key !== FAVORITES_STORAGE_KEY) return;
      const before = current();
      if (before.status !== "saved") return;
      publish({ ids: parseStoredFavorites(newValue), status: "saved" });
    },
  };
}
