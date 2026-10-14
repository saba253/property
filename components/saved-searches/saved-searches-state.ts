"use client";

import { createBrowserStore } from "@/components/storage/browser-store";
import {
  type AddSearchOutcome,
  SAVED_SEARCHES_STORAGE_KEY,
  type SavedSearch,
  addSavedSearch,
  createSearchId,
  parseStoredSavedSearches,
  removeSavedSearch,
  renameSavedSearch,
  sameSavedSearches,
  serializeSavedSearches,
} from "@/lib/saved-searches/saved-searches";

const savedSearches = createBrowserStore<readonly SavedSearch[]>({
  key: SAVED_SEARCHES_STORAGE_KEY,
  empty: [],
  parse: parseStoredSavedSearches,
  serialize: serializeSavedSearches,
  equals: sameSavedSearches,
});

/** Saved searches of this browser (empty and "loading" on the server and during hydration). */
export function useSavedSearches() {
  const { value, status } = savedSearches.useSnapshot();
  return { searches: value, status };
}

/** Saves a search; returns what happened (and the already saved search for a duplicate). */
export function saveSearch(
  name: string,
  query: string,
): {
  outcome: AddSearchOutcome;
  existing?: SavedSearch;
} {
  const store = savedSearches.getStore();
  const result = addSavedSearch(store.getSnapshot().value, { id: createSearchId(), name, query });
  if (result.outcome === "added") store.update(() => result.searches);
  return { outcome: result.outcome, existing: result.existing };
}

export function renameSearch(id: string, name: string) {
  savedSearches.getStore().update((searches) => renameSavedSearch(searches, id, name));
}

export function deleteSearch(id: string) {
  savedSearches.getStore().update((searches) => removeSavedSearch(searches, id));
}
