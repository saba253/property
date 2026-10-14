"use client";

import { useSyncExternalStore } from "react";
import {
  type PersistentSnapshot,
  type PersistentStore,
  type PersistentStoreOptions,
  createPersistentStore,
} from "@/lib/storage/persistent-store";

/**
 * One store per browser tab for a localStorage-backed value, created on first use, kept in sync
 * with other tabs through the browser's "storage" event. `useSnapshot` returns the server
 * snapshot during server rendering and hydration, so markup always matches.
 */
export function createBrowserStore<T>(options: PersistentStoreOptions<T>) {
  let store: PersistentStore<T> | null = null;

  function getStore(): PersistentStore<T> {
    if (!store) {
      // Accessing window.localStorage can itself throw (blocked site data); the store handles it.
      store = createPersistentStore(options, () =>
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

  function useSnapshot(): PersistentSnapshot<T> {
    return useSyncExternalStore(
      subscribe,
      () => getStore().getSnapshot(),
      () => getStore().getServerSnapshot(),
    );
  }

  /** Selects a primitive from the value, so components re-render only when it changes. */
  function useSelect<R extends string | number | boolean | null>(
    select: (value: T) => R,
    serverValue: R,
  ): R {
    return useSyncExternalStore(
      subscribe,
      () => select(getStore().getSnapshot().value),
      () => serverValue,
    );
  }

  return { getStore, useSnapshot, useSelect };
}
