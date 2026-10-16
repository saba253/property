import type { DraftDeps } from "@/lib/drafts/draft-service";
import type { NotificationItem } from "@/lib/notifications/notification-types";
import {
  isNotificationId,
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
} from "@/lib/notifications/notification-store";

/*
 * Notifications for the signed-in user (no Next.js imports). The user id comes only from the
 * verified session; ids from the browser are checked for shape and always combined with it.
 */

export const NOTIFICATION_PAGE_SIZE = 20;

export async function notificationsForUser(
  deps: DraftDeps,
  page: unknown,
): Promise<{ items: NotificationItem[]; total: number; page: number; pageSize: number } | null> {
  const userId = await deps.currentUserId();
  if (!userId) return null;
  const n = Number(page);
  const safePage = Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1;
  const result = await deps.withConnection((db) =>
    listNotifications(db, userId, safePage, NOTIFICATION_PAGE_SIZE),
  );
  return { ...result, page: safePage, pageSize: NOTIFICATION_PAGE_SIZE };
}

/** Unread notifications of the signed-in user (0 when signed out). */
export async function unreadForUser(deps: DraftDeps): Promise<number> {
  const userId = await deps.currentUserId();
  if (!userId) return 0;
  return deps.withConnection((db) => unreadCount(db, userId));
}

export async function markNotificationRead(deps: DraftDeps, id: unknown): Promise<boolean> {
  const userId = await deps.currentUserId();
  if (!userId || !isNotificationId(id)) return false;
  try {
    return await deps.withConnection((db) => markRead(db, userId, id));
  } catch {
    return false;
  }
}

export async function markAllNotificationsRead(deps: DraftDeps): Promise<boolean> {
  const userId = await deps.currentUserId();
  if (!userId) return false;
  try {
    await deps.withConnection((db) => markAllRead(db, userId));
    return true;
  } catch {
    return false;
  }
}
