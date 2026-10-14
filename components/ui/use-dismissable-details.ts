"use client";

import { type RefObject, useEffect } from "react";

/**
 * Closes an open <details> menu on Escape (returning focus to its summary) or on a click outside
 * it. Used by the sort menu and the header menu.
 */
export function useDismissableDetails(ref: RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    const details = ref.current;
    if (!details) return;
    const close = (event: Event) => {
      if (!details.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        details.open = false;
        details.querySelector("summary")?.focus();
        return;
      }
      if (!details.contains(event.target as Node)) details.open = false;
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [ref]);
}
