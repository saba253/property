import { describe, expect, it, vi } from "vitest";
import {
  FAVORITES_STORAGE_KEY,
  MAX_FAVORITES,
  addFavorite,
  isValidListingId,
  normalizeFavoriteIds,
  parseStoredFavorites,
  removeFavorite,
  resolveFavorites,
  serializeFavorites,
  toggleFavorite,
} from "@/lib/favorites/favorites";
import { SERVER_SNAPSHOT, createFavoritesStore } from "@/lib/favorites/favorites-store";
import { getDemoListingIds } from "@/lib/properties/get-demo-listing";

/** In-memory stand-in for window.localStorage. */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("favorite id helpers", () => {
  it("adds, removes and toggles", () => {
    expect(addFavorite([], "demo-listing-1")).toEqual(["demo-listing-1"]);
    expect(removeFavorite(["demo-listing-1", "demo-listing-2"], "demo-listing-1")).toEqual([
      "demo-listing-2",
    ]);
    const once = toggleFavorite([], "demo-listing-3");
    expect(once).toEqual(["demo-listing-3"]);
    expect(toggleFavorite(once, "demo-listing-3")).toEqual([]);
  });

  it("never stores duplicates or invalid ids", () => {
    expect(addFavorite(["demo-listing-1"], "demo-listing-1")).toEqual(["demo-listing-1"]);
    expect(addFavorite([], "<script>")).toEqual([]);
    expect(normalizeFavoriteIds(["a", "a", 5, null, "", "B!", "demo-listing-2"])).toEqual([
      "a",
      "demo-listing-2",
    ]);
    expect(isValidListingId("x".repeat(65))).toBe(false);
  });

  it("keeps at most MAX_FAVORITES, dropping the oldest", () => {
    let ids: string[] = [];
    for (let index = 0; index < MAX_FAVORITES + 5; index++) ids = addFavorite(ids, `l-${index}`);
    expect(ids).toHaveLength(MAX_FAVORITES);
    expect(ids[0]).toBe("l-5");
    expect(ids.at(-1)).toBe(`l-${MAX_FAVORITES + 4}`);
  });

  it("does not change the input arrays", () => {
    const ids = ["demo-listing-1"];
    addFavorite(ids, "demo-listing-2");
    removeFavorite(ids, "demo-listing-1");
    expect(ids).toEqual(["demo-listing-1"]);
  });
});

describe("stored data", () => {
  it("round-trips through the versioned format", () => {
    const raw = serializeFavorites(["demo-listing-2", "demo-listing-1"]);
    expect(JSON.parse(raw)).toEqual({ version: 1, ids: ["demo-listing-2", "demo-listing-1"] });
    expect(parseStoredFavorites(raw)).toEqual(["demo-listing-2", "demo-listing-1"]);
  });

  it("ignores missing, malformed or unexpected data", () => {
    expect(parseStoredFavorites(null)).toEqual([]);
    expect(parseStoredFavorites("{not json")).toEqual([]);
    expect(parseStoredFavorites('["demo-listing-1"]')).toEqual([]);
    expect(parseStoredFavorites('{"version":2,"ids":["demo-listing-1"]}')).toEqual([]);
    expect(parseStoredFavorites('{"version":1,"ids":"demo-listing-1"}')).toEqual([]);
    expect(
      parseStoredFavorites('{"version":1,"ids":["demo-listing-1",{"x":1},"demo-listing-1"]}'),
    ).toEqual(["demo-listing-1"]);
  });

  it("uses a namespaced, versioned key", () => {
    expect(FAVORITES_STORAGE_KEY).toBe("property-intelligence:favorites:v1");
  });
});

describe("resolveFavorites", () => {
  it("shows newest saved first and separates listings that no longer exist", () => {
    const known = getDemoListingIds();
    expect(
      resolveFavorites(["demo-listing-1", "deleted-listing", "demo-listing-4"], known),
    ).toEqual({
      available: ["demo-listing-4", "demo-listing-1"],
      missing: ["deleted-listing"],
    });
    expect(resolveFavorites([], known)).toEqual({ available: [], missing: [] });
  });
});

describe("favorites store", () => {
  it("starts empty and 'loading' on the server, so hydration markup matches", () => {
    const store = createFavoritesStore(() => memoryStorage());
    expect(store.getServerSnapshot()).toBe(SERVER_SNAPSHOT);
    expect(SERVER_SNAPSHOT).toEqual({ ids: [], status: "loading" });
  });

  it("loads saved ids and persists changes", () => {
    const storage = memoryStorage({
      [FAVORITES_STORAGE_KEY]: serializeFavorites(["demo-listing-2"]),
    });
    const store = createFavoritesStore(() => storage);
    expect(store.getSnapshot()).toEqual({ ids: ["demo-listing-2"], status: "saved" });
    store.add("demo-listing-5");
    store.toggle("demo-listing-2");
    expect(store.getSnapshot().ids).toEqual(["demo-listing-5"]);
    expect(parseStoredFavorites(storage.getItem(FAVORITES_STORAGE_KEY))).toEqual([
      "demo-listing-5",
    ]);
    // A new store (a page reload) reads the same state back.
    expect(createFavoritesStore(() => storage).getSnapshot().ids).toEqual(["demo-listing-5"]);
  });

  it("returns the same snapshot object until something changes", () => {
    const store = createFavoritesStore(() => memoryStorage());
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    store.add("demo-listing-1");
    store.add("demo-listing-1"); // no change: no new snapshot
    const second = store.getSnapshot();
    expect(second).not.toBe(first);
    store.add("demo-listing-1");
    expect(store.getSnapshot()).toBe(second);
  });

  it("notifies every subscriber, so all heart buttons stay in sync", () => {
    const store = createFavoritesStore(() => memoryStorage());
    const a = vi.fn();
    const b = vi.fn();
    const unsubscribeA = store.subscribe(a);
    store.subscribe(b);
    store.toggle("demo-listing-3");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    unsubscribeA();
    store.toggle("demo-listing-3");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it("works in memory when storage is unavailable or throws", () => {
    const blocked = createFavoritesStore(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(blocked.getSnapshot().status).toBe("memory-only");
    blocked.add("demo-listing-1");
    expect(blocked.getSnapshot()).toEqual({ ids: ["demo-listing-1"], status: "memory-only" });

    const noStorage = createFavoritesStore(() => null);
    expect(noStorage.getSnapshot().status).toBe("memory-only");

    const unreadable = createFavoritesStore(() => ({
      getItem: () => {
        throw new Error("read failed");
      },
      setItem: () => {},
    }));
    expect(unreadable.getSnapshot()).toEqual({ ids: [], status: "memory-only" });
  });

  it("switches to memory-only when a write fails (for example quota exceeded)", () => {
    const store = createFavoritesStore(() => ({
      getItem: () => null,
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    }));
    expect(store.getSnapshot().status).toBe("saved");
    store.add("demo-listing-1");
    expect(store.getSnapshot()).toEqual({ ids: ["demo-listing-1"], status: "memory-only" });
  });

  it("applies changes from other tabs and ignores unrelated keys", () => {
    const store = createFavoritesStore(() => memoryStorage());
    store.add("demo-listing-1");
    const listener = vi.fn();
    store.subscribe(listener);
    store.handleStorageChange("other-key", "whatever");
    expect(listener).not.toHaveBeenCalled();
    store.handleStorageChange(
      FAVORITES_STORAGE_KEY,
      serializeFavorites(["demo-listing-1", "demo-listing-6"]),
    );
    expect(store.getSnapshot().ids).toEqual(["demo-listing-1", "demo-listing-6"]);
    store.handleStorageChange(FAVORITES_STORAGE_KEY, "{broken");
    expect(store.getSnapshot().ids).toEqual([]);
    // Another tab cleared all site storage.
    store.add("demo-listing-2");
    store.handleStorageChange(null, null);
    expect(store.getSnapshot().ids).toEqual([]);
  });

  it("keeps saved ids independent of filters, sorting, currency and views", () => {
    // The store has no notion of filters or views: only explicit add/remove change it.
    const storage = memoryStorage();
    const store = createFavoritesStore(() => storage);
    store.add("demo-listing-1");
    store.add("demo-listing-9");
    const reloaded = createFavoritesStore(() => storage);
    expect(reloaded.getSnapshot().ids).toEqual(["demo-listing-1", "demo-listing-9"]);
    expect(storage.data.size).toBe(1);
  });
});
