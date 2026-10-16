"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** The visitor's own account state from /api/account/status (null until it is known). */
export type AccountStatus = {
  enabled: boolean;
  signedIn: boolean;
  name?: string | null;
  /** Unread notifications (null when they could not be counted). */
  unread?: number | null;
};

/** Window event that makes every useAccountStatus() ask again (e.g. after marking as read). */
export const ACCOUNT_STATUS_REFRESH = "property-intelligence:account-status-refresh";

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
    const load = () =>
      fetch("/api/account/status", { credentials: "same-origin", cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: AccountStatus | null) => {
          if (!cancelled && data) setStatus(data);
        })
        .catch(() => {});
    load();
    window.addEventListener(ACCOUNT_STATUS_REFRESH, load);
    return () => {
      cancelled = true;
      window.removeEventListener(ACCOUNT_STATUS_REFRESH, load);
    };
  }, [pathname]);
  return status;
}
