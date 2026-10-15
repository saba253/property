"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { StorageStatus } from "@/lib/storage/persistent-store";

/**
 * Keeps `?ids=` of the favorites/comparison page equal to the ids saved in this browser, so the
 * server renders exactly those listings. Uses replace (no extra history entries, so Back still
 * leaves the page) and never writes URL ids into storage: a link with other ids cannot change
 * what this browser has saved.
 */
export function SelectionUrlSync({
  ids,
  status,
  requestedIds,
}: {
  ids: readonly string[];
  status: StorageStatus;
  requestedIds: readonly string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const wanted = ids.join(",");
  const current = requestedIds.join(",");

  useEffect(() => {
    if (status === "loading" || wanted === current) return;
    const params = new URLSearchParams(window.location.search);
    if (wanted) params.set("ids", wanted);
    else params.delete("ids");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [status, wanted, current, pathname, router]);

  return null;
}
