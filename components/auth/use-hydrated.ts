"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False in the server HTML and until React has attached the event handlers, then true. Account
 * forms keep their submit button disabled until then: a submit before hydration would bypass the
 * fetch handler and let the browser send the form itself.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
