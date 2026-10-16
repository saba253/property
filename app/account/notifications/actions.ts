"use server";

import { draftDeps } from "@/lib/drafts/instance";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/notification-service";

/*
 * Read state of the signed-in user's own notifications. The user comes from the session only;
 * a notification id of another user changes nothing. Origin-checked by Next.js.
 */
export async function markReadAction(id: unknown): Promise<{ ok: boolean }> {
  return { ok: await markNotificationRead(draftDeps, id) };
}

export async function markAllReadAction(): Promise<{ ok: boolean }> {
  return { ok: await markAllNotificationsRead(draftDeps) };
}
