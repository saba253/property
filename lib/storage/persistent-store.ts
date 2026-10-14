/*
 * A small browser-local store for one JSON value under one localStorage key, shared by favorites,
 * the comparison selection and saved searches. It never throws because of storage problems:
 * when localStorage is blocked, unreadable or full, it keeps working in memory and reports that
 * through `status`, so the UI can say so honestly.
 */

/** The part of the Web Storage API the store needs (window.localStorage in the browser). */
export type BrowserStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * - "loading": not read yet (always the case on the server and during hydration).
 * - "saved": stored in this browser's localStorage.
 * - "memory-only": localStorage is unavailable or refused a write; data lasts until reload.
 */
export type StorageStatus = "loading" | "saved" | "memory-only";

export type PersistentSnapshot<T> = { readonly value: T; readonly status: StorageStatus };

export type PersistentStoreOptions<T> = {
  key: string;
  /** Value before anything is stored, and for missing or invalid data. */
  empty: T;
  /** Reads stored text; must return a valid value (or `empty`) for any input, never throw. */
  parse: (raw: string | null) => T;
  serialize: (value: T) => string;
  /** Equality, to avoid writes and re-renders when nothing changed. */
  equals: (a: T, b: T) => boolean;
};

export type PersistentStore<T> = {
  /** For useSyncExternalStore: the same object until something changes. */
  getSnapshot: () => PersistentSnapshot<T>;
  /** Used on the server and during hydration, so both render the same markup. */
  getServerSnapshot: () => PersistentSnapshot<T>;
  subscribe: (listener: () => void) => () => void;
  /** Applies a change; returns the new value. Nothing is written if the value is unchanged. */
  update: (change: (value: T) => T) => T;
  /** Applies a change made in another tab (from the browser's "storage" event). */
  handleStorageChange: (key: string | null, newValue: string | null) => void;
};

/**
 * `getStorage` is called lazily (only in the browser) and may throw, for example when site data
 * is blocked; that is treated as "no storage".
 */
export function createPersistentStore<T>(
  options: PersistentStoreOptions<T>,
  getStorage: () => BrowserStorage | null,
): PersistentStore<T> {
  const serverSnapshot: PersistentSnapshot<T> = Object.freeze({
    value: options.empty,
    status: "loading",
  });
  let snapshot: PersistentSnapshot<T> | null = null;
  let storage: BrowserStorage | null = null;
  const listeners = new Set<() => void>();

  function load(): PersistentSnapshot<T> {
    try {
      storage = getStorage();
    } catch {
      storage = null;
    }
    if (!storage) return { value: options.empty, status: "memory-only" };
    try {
      return { value: options.parse(storage.getItem(options.key)), status: "saved" };
    } catch {
      storage = null;
      return { value: options.empty, status: "memory-only" };
    }
  }

  function current(): PersistentSnapshot<T> {
    snapshot ??= load();
    return snapshot;
  }

  function publish(next: PersistentSnapshot<T>) {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  return {
    getSnapshot: current,
    getServerSnapshot: () => serverSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(change) {
      const before = current();
      const value = change(before.value);
      if (options.equals(value, before.value)) return before.value;
      let status = before.status;
      if (storage) {
        try {
          storage.setItem(options.key, options.serialize(value));
        } catch {
          // Quota exceeded or storage blocked: keep working in memory and say so.
          storage = null;
          status = "memory-only";
        }
      }
      publish({ value, status });
      return value;
    },
    handleStorageChange(key, newValue) {
      // key === null means another tab cleared all storage for this site.
      if (key !== null && key !== options.key) return;
      if (current().status !== "saved") return;
      publish({ value: options.parse(newValue), status: "saved" });
    },
  };
}

/** Equality for arrays of strings (ids). */
export function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}
