import {
  FAVORITES_STORAGE_KEY,
  addFavorite,
  parseStoredFavorites,
  removeFavorite,
  serializeFavorites,
  toggleFavorite,
} from "@/lib/favorites/favorites";
import {
  type BrowserStorage,
  type StorageStatus,
  createPersistentStore,
  sameStrings,
} from "@/lib/storage/persistent-store";

/** The part of the Web Storage API the store needs (window.localStorage in the browser). */
export type FavoritesStorage = BrowserStorage;

export type FavoritesStatus = StorageStatus;

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
 * One shared source of truth for saved listing ids, built on the generic persistent store. Every
 * heart button, the header count and the favorites page read the same store, so they agree.
 */
export function createFavoritesStore(getStorage: () => FavoritesStorage | null): FavoritesStore {
  const store = createPersistentStore<readonly string[]>(
    {
      key: FAVORITES_STORAGE_KEY,
      empty: [],
      parse: parseStoredFavorites,
      serialize: serializeFavorites,
      equals: sameStrings,
    },
    getStorage,
  );

  // Keep the favorites snapshot shape ({ ids, status }) stable per underlying snapshot.
  let source: ReturnType<typeof store.getSnapshot> | null = null;
  let mapped: FavoritesSnapshot = SERVER_SNAPSHOT;
  function getSnapshot(): FavoritesSnapshot {
    const next = store.getSnapshot();
    if (next !== source) {
      source = next;
      mapped = { ids: next.value, status: next.status };
    }
    return mapped;
  }

  return {
    getSnapshot,
    getServerSnapshot: () => SERVER_SNAPSHOT,
    subscribe: store.subscribe,
    add: (id) => void store.update((ids) => addFavorite(ids, id)),
    remove: (id) => void store.update((ids) => removeFavorite(ids, id)),
    toggle: (id) => void store.update((ids) => toggleFavorite(ids, id)),
    handleStorageChange: store.handleStorageChange,
  };
}
