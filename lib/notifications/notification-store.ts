import type { SqlClient } from "@/lib/db/sql-client";
import type { NotificationItem, NotificationKind } from "@/lib/notifications/notification-types";

/*
 * In-app notifications (migration 0006). Rows are created only by the database trigger that
 * records a moderator's decision, in the same transaction. Every statement here is limited to
 * `userId`, taken from the verified session by the caller: another user's notification behaves
 * like a missing one. The only change allowed afterwards is marking it as read (also enforced
 * by a trigger). No moderator identity, email or event id is ever returned.
 */

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS"Z"'`;
const NOTIFICATION_ID = /^nt-[0-9a-f-]{36}$/;

export function isNotificationId(value: unknown): value is string {
  return typeof value === "string" && NOTIFICATION_ID.test(value);
}

export async function listNotifications(
  db: SqlClient,
  userId: string,
  page: number,
  pageSize: number,
): Promise<{ items: NotificationItem[]; total: number }> {
  const { rows } = await db.query<{
    id: string;
    kind: NotificationKind;
    listing_id: string;
    title: string;
    listing_status: string;
    reason: string | null;
    created_at: string;
    read: boolean;
    total: number;
  }>(
    `SELECT n.id, n.kind, n.listing_id, l.title, l.status AS listing_status, e.reason,
            to_char(n.created_at AT TIME ZONE 'UTC', ${ISO}) AS created_at,
            n.read_at IS NOT NULL AS read, count(*) OVER ()::int AS total
     FROM notifications n
       JOIN listings l ON l.id = n.listing_id AND l.owner_user_id = n.user_id
       JOIN listing_status_events e ON e.id = n.event_id
     WHERE n.user_id = $1
     ORDER BY n.created_at DESC, n.id
     LIMIT $2 OFFSET $3`,
    [userId, pageSize, (page - 1) * pageSize],
  );
  return {
    total: rows[0]?.total ?? 0,
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      listingId: row.listing_id,
      title: row.title,
      listingAvailable: row.listing_status !== "archived",
      reason: row.reason,
      createdAt: row.created_at,
      read: row.read,
    })),
  };
}

export async function unreadCount(db: SqlClient, userId: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL",
    [userId],
  );
  return rows[0].n;
}

/** Marks one of the user's notifications as read. False when it is not theirs. */
export async function markRead(db: SqlClient, userId: string, id: string): Promise<boolean> {
  const { rows } = await db.query<{ id: string }>(
    `UPDATE notifications SET read_at = coalesce(read_at, now())
     WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId],
  );
  return rows.length === 1;
}

/** Marks all of the user's unread notifications as read; returns how many changed. */
export async function markAllRead(db: SqlClient, userId: string): Promise<number> {
  const { rows } = await db.query<{ id: string }>(
    "UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL RETURNING id",
    [userId],
  );
  return rows.length;
}
