"use client";

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import { createBrowserStore } from "@/components/storage/browser-store";
import {
  COMPARE_MESSAGES,
  COMPARE_STORAGE_KEY,
  type TransactionLookup,
  addToComparison,
  parseStoredComparison,
  removeFromComparison,
  serializeComparison,
} from "@/lib/compare/compare-selection";
import { sameStrings } from "@/lib/storage/persistent-store";
import type { ListingImage, TransactionType } from "@/lib/properties/types";

/** What the tray and buttons need to know about a listing, provided by the server. */
export type CompareCatalogEntry = {
  id: string;
  title: string;
  href: string;
  transactionType: TransactionType;
  coverImage: ListingImage | null;
};

const selection = createBrowserStore<readonly string[]>({
  key: COMPARE_STORAGE_KEY,
  empty: [],
  parse: parseStoredComparison,
  serialize: serializeComparison,
  equals: sameStrings,
});

// The latest refusal message ("full", "mixed transaction", ...). Not stored: it is only feedback.
let notice: string | null = null;
const noticeListeners = new Set<() => void>();
function setNotice(next: string | null) {
  notice = next;
  for (const listener of noticeListeners) listener();
}

const CatalogContext = createContext<ReadonlyMap<string, CompareCatalogEntry>>(new Map());

/** Provides the catalog of comparable listings (all available listings) to the compare UI. */
export function CompareCatalogProvider({
  entries,
  children,
}: {
  entries: readonly CompareCatalogEntry[];
  children: ReactNode;
}) {
  const catalog = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);
  return <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>;
}

export function useCompareCatalog(): ReadonlyMap<string, CompareCatalogEntry> {
  return useContext(CatalogContext);
}

function useLookup(): TransactionLookup {
  const catalog = useCompareCatalog();
  return useCallback((id: string) => catalog.get(id)?.transactionType, [catalog]);
}

/** Add/remove/clear actions only: using them does not subscribe to the selection. */
export function useCompareActions() {
  const lookup = useLookup();
  const add = useCallback(
    (id: string) => {
      const store = selection.getStore();
      const result = addToComparison(store.getSnapshot().value, id, lookup);
      if (result.outcome === "added") {
        store.update(() => result.ids);
        setNotice(null);
      } else {
        setNotice(COMPARE_MESSAGES[result.outcome]);
      }
    },
    [lookup],
  );
  const remove = useCallback((id: string) => {
    selection.getStore().update((ids) => removeFromComparison(ids, id));
    setNotice(null);
  }, []);
  const clear = useCallback(() => {
    selection.getStore().update(() => []);
    setNotice(null);
  }, []);
  const dismissNotice = useCallback(() => setNotice(null), []);
  return { add, remove, clear, dismissNotice, lookup };
}

/** Selected ids (only after hydration), storage status, the latest notice, and actions. */
export function useComparison() {
  const snapshot = selection.useSnapshot();
  const currentNotice = useSyncExternalStore(
    (listener) => {
      noticeListeners.add(listener);
      return () => noticeListeners.delete(listener);
    },
    () => notice,
    () => null,
  );
  return {
    ids: snapshot.value,
    status: snapshot.status,
    notice: currentNotice,
    ...useCompareActions(),
  };
}

/** Whether one listing is selected; re-renders only when that changes. */
export function useIsCompared(listingId: string): boolean {
  return selection.useSelect((ids) => ids.includes(listingId), false);
}
