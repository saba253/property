"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { createBrowserStore } from "@/components/storage/browser-store";
import type { ListingSummary, LookupResponse } from "@/lib/api/listing-lookup";
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
import type { TransactionType } from "@/lib/properties/types";

/*
 * The comparison selection (ids in this browser's storage) and what the tray needs about the
 * selected listings. Summaries are fetched only for the selected ids (at most four) from the
 * read-only lookup endpoint; the full catalog is never sent to the browser. An id is dropped from
 * the selection only when the server explicitly reports it as missing; a network or database
 * error never removes anything.
 */

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

/** Summaries known in this tab: found listings, ids reported missing, and the last failure. */
export type SummaryState = {
  byId: ReadonlyMap<string, ListingSummary>;
  missing: ReadonlySet<string>;
  failed: boolean;
};

const EMPTY_SUMMARIES: SummaryState = { byId: new Map(), missing: new Set(), failed: false };
let summaries: SummaryState = EMPTY_SUMMARIES;
const summaryListeners = new Set<() => void>();
const inFlight = new Map<string, Promise<void>>();

function setSummaries(next: SummaryState) {
  summaries = next;
  for (const listener of summaryListeners) listener();
}

/** Loads summaries for ids that are not known yet; resolves when they are known (or failed). */
export function ensureSummaries(ids: readonly string[]): Promise<void> {
  const unknown = ids.filter(
    (id) => !summaries.byId.has(id) && !summaries.missing.has(id) && !inFlight.has(id),
  );
  if (unknown.length > 0) {
    const request = fetch("/api/listings/summaries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: unknown }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as LookupResponse;
        const byId = new Map(summaries.byId);
        for (const listing of data.listings) byId.set(listing.id, listing);
        setSummaries({
          byId,
          missing: new Set([...summaries.missing, ...data.missing]),
          failed: false,
        });
      })
      .catch(() => setSummaries({ ...summaries, failed: true }))
      .finally(() => unknown.forEach((id) => inFlight.delete(id)));
    unknown.forEach((id) => inFlight.set(id, request));
  }
  return Promise.all(ids.map((id) => inFlight.get(id)).filter(Boolean)).then(() => undefined);
}

/** The current summaries (for tests and non-React callers). */
export function readSummaries(): SummaryState {
  return summaries;
}

function useSummaryState(): SummaryState {
  return useSyncExternalStore(
    (listener) => {
      summaryListeners.add(listener);
      return () => summaryListeners.delete(listener);
    },
    () => summaries,
    () => EMPTY_SUMMARIES,
  );
}

const lookupFrom =
  (state: SummaryState): TransactionLookup =>
  (id) =>
    state.byId.get(id)?.transactionType;

/** Add/remove/clear actions only: using them does not subscribe to the selection. */
export function useCompareActions() {
  const add = useCallback(async (id: string, transactionType: TransactionType) => {
    const store = selection.getStore();
    // The transaction types of the already selected listings decide whether this one fits.
    await ensureSummaries(store.getSnapshot().value);
    const current = store.getSnapshot().value;
    const pending = current.filter(
      (item) => !summaries.byId.has(item) && !summaries.missing.has(item),
    );
    if (pending.length > 0) {
      setNotice("შედარების შემოწმება ვერ მოხერხდა. სცადეთ თავიდან.");
      return;
    }
    const known = lookupFrom(summaries);
    const result = addToComparison(current, id, (item) =>
      item === id ? transactionType : known(item),
    );
    if (result.outcome === "added") {
      store.update(() => result.ids);
      setNotice(null);
    } else {
      setNotice(COMPARE_MESSAGES[result.outcome]);
    }
  }, []);
  const remove = useCallback((id: string) => {
    selection.getStore().update((ids) => removeFromComparison(ids, id));
    setNotice(null);
  }, []);
  const clear = useCallback(() => {
    selection.getStore().update(() => []);
    setNotice(null);
  }, []);
  const dismissNotice = useCallback(() => setNotice(null), []);
  return { add, remove, clear, dismissNotice };
}

/**
 * Selected ids (only after hydration), storage status, the latest notice, summaries of the
 * selected listings and actions. Ids the server reported missing are pruned from storage.
 */
export function useComparison() {
  const snapshot = selection.useSnapshot();
  const state = useSummaryState();
  const actions = useCompareActions();
  const currentNotice = useSyncExternalStore(
    (listener) => {
      noticeListeners.add(listener);
      return () => noticeListeners.delete(listener);
    },
    () => notice,
    () => null,
  );
  const ids = snapshot.value;
  const ready = snapshot.status !== "loading";

  useEffect(() => {
    if (ready && ids.length > 0) void ensureSummaries(ids);
  }, [ids, ready]);

  const { remove } = actions;
  useEffect(() => {
    if (!ready) return;
    for (const id of ids) if (state.missing.has(id)) remove(id);
  }, [ids, ready, state.missing, remove]);

  const available = ids.filter((id) => !state.missing.has(id));
  return {
    ids,
    /** Selected ids not reported missing (some may still be loading). */
    available,
    summaries: state,
    lookup: lookupFrom(state),
    status: snapshot.status,
    notice: currentNotice,
    ...actions,
  };
}

/** Whether one listing is selected; re-renders only when that changes. */
export function useIsCompared(listingId: string): boolean {
  return selection.useSelect((ids) => ids.includes(listingId), false);
}

/** The selected ids only (for the comparison page's URL), without summaries. */
export function useComparedIds() {
  const snapshot = selection.useSnapshot();
  return { ids: snapshot.value, status: snapshot.status };
}
