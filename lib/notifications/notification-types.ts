/* Notification shapes shared by the server and the browser (no server code). */

export type NotificationKind = "changes_requested" | "approved" | "rejected";

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  listingId: string;
  title: string;
  /** False when the listing was archived since (no link then). */
  listingAvailable: boolean;
  /** The moderator's reason for change requests and rejections. */
  reason: string | null;
  createdAt: string;
  read: boolean;
};
