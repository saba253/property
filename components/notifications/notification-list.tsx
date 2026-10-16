"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { markAllReadAction, markReadAction } from "@/app/account/notifications/actions";
import { ACCOUNT_STATUS_REFRESH } from "@/components/auth/use-account-status";
import { buttonSecondary, card } from "@/components/ui/styles";
import type { NotificationItem, NotificationKind } from "@/lib/notifications/notification-types";

/*
 * The signed-in user's notifications. Unread ones are highlighted; opening the listing or
 * "წაკითხულად მონიშვნა" marks them as read on the server (own notifications only).
 */

const TEXT: Record<NotificationKind, { title: string; tone: string }> = {
  changes_requested: {
    title: "მოდერატორმა ცვლილება მოითხოვა",
    tone: "bg-amber-50 text-amber-900 ring-amber-200",
  },
  approved: {
    title: "განცხადება დამტკიცდა (ჯერ არ გამოქვეყნებულა)",
    tone: "bg-accent-50 text-navy ring-accent-100",
  },
  rejected: { title: "განცხადება უარყოფილია", tone: "bg-red-50 text-red-800 ring-red-200" },
};

function refreshBell() {
  window.dispatchEvent(new Event(ACCOUNT_STATUS_REFRESH));
}

/** A notification with its time already formatted on the server (same text in every browser). */
export type NotificationRow = NotificationItem & { createdAtText: string };

export function NotificationList({ items }: { items: readonly NotificationRow[] }) {
  const router = useRouter();
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);
  const isRead = (item: NotificationRow) => item.read || readIds.has(item.id);
  const unread = items.filter((item) => !isRead(item)).length;

  async function markOne(id: string) {
    const result = await markReadAction(id).catch(() => null);
    if (result?.ok) {
      setReadIds((ids) => new Set(ids).add(id));
      refreshBell();
    }
  }

  async function markAll() {
    setPending(true);
    const result = await markAllReadAction().catch(() => null);
    setPending(false);
    if (result?.ok) {
      setReadIds(new Set(items.map((item) => item.id)));
      refreshBell();
      router.refresh();
    }
  }

  return (
    <>
      {unread > 0 && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={markAll}
            disabled={pending}
            className={`${buttonSecondary} h-10 px-4 text-sm disabled:opacity-60`}
          >
            ყველას წაკითხულად მონიშვნა
          </button>
        </div>
      )}
      <ul className="mt-4 space-y-3">
        {items.map((item) => {
          const read = isRead(item);
          const text = TEXT[item.kind];
          return (
            <li
              key={item.id}
              className={`${card} p-4 sm:p-5 ${read ? "" : "border-l-4 border-l-navy bg-cream/60"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${text.tone}`}
                    >
                      {text.title}
                    </span>
                    <span className="text-xs text-subtle">
                      {read ? "წაკითხული" : "ახალი"} · {item.createdAtText}
                    </span>
                  </p>
                  <p className="mt-2 text-sm font-semibold break-words text-navy">{item.title}</p>
                  {item.reason && (
                    <p className="mt-1 text-sm whitespace-pre-line text-muted">
                      <span className="font-medium text-navy">კომენტარი:</span> {item.reason}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                {item.listingAvailable ? (
                  <Link
                    href={`/account/listings/view?listing=${encodeURIComponent(item.listingId)}`}
                    onClick={() => {
                      if (!read) void markOne(item.id);
                    }}
                    className="font-semibold text-accent-700 hover:underline"
                  >
                    განცხადების ნახვა →
                  </Link>
                ) : (
                  <span className="text-subtle">განცხადება წაშლილია</span>
                )}
                {!read && (
                  <button
                    type="button"
                    onClick={() => markOne(item.id)}
                    className="min-h-10 font-medium text-muted hover:text-ink"
                  >
                    წაკითხულად მონიშვნა
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
