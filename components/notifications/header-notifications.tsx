"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccountStatus } from "@/components/auth/use-account-status";

/*
 * Notification bell for signed-in users, with the number of unread notifications. Like the
 * account entry it appears only after hydration (the server renders nothing), so static pages
 * stay static and markup matches. The count comes from /api/account/status (own session only).
 */

export function BellIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={`${className} fill-current`}>
      <path d="M10 2a1 1 0 0 1 1 1v.6A5.5 5.5 0 0 1 15.5 9v2.7l1.3 2.1A1 1 0 0 1 16 15.3H4a1 1 0 0 1-.8-1.5l1.3-2.1V9A5.5 5.5 0 0 1 9 3.6V3a1 1 0 0 1 1-1Zm0 3.5A3.5 3.5 0 0 0 6.5 9v3a1 1 0 0 1-.15.53l-.55.77h8.4l-.55-.77A1 1 0 0 1 13.5 12V9A3.5 3.5 0 0 0 10 5.5ZM8 16.5h4a2 2 0 0 1-4 0Z" />
    </svg>
  );
}

export function HeaderNotifications() {
  const status = useAccountStatus();
  const active = usePathname() === "/account/notifications";
  if (!status?.signedIn) return null;
  const count = status.unread ?? 0;
  const shown = count > 99 ? "99+" : String(count);

  return (
    <Link
      href="/account/notifications"
      aria-current={active ? "page" : undefined}
      aria-label={count > 0 ? `შეტყობინებები, წაუკითხავი: ${count}` : "შეტყობინებები"}
      className={`relative inline-flex h-10 items-center rounded-full px-2.5 text-navy transition-colors hover:bg-cream ${
        active ? "bg-cream" : ""
      }`}
    >
      <BellIcon />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 min-w-5 rounded-full bg-accent-700 px-1 text-center text-[11px] leading-5 font-semibold text-white"
        >
          {shown}
        </span>
      )}
    </Link>
  );
}
