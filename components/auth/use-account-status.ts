"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** The visitor's own account state from /api/account/status (null until it is known). */
export type AccountStatus = { enabled: boolean; signedIn: boolean; name?: string | null };

/**
 * Asks the server after hydration (and after navigation) whether accounts are on and whether
 * this visitor is signed in. The server render and the first client render never know, so
 * markup always matches; nothing is stored in the browser.
 */
export function useAccountStatus(): AccountStatus | null {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const pathname = usePathname();
  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/status", { credentials: "same-origin", cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: AccountStatus | null) => {
        if (!cancelled && data) setStatus(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);
  return status;
}
