import { PGlite } from "@electric-sql/pglite";
import { PostgresDialect } from "kysely";
import type { EmailMessage } from "@/lib/auth/email";
import { type Auth, createAuth } from "@/lib/auth/server";
import { loadMigrations, runMigrations } from "@/lib/db/migrations";
import { pglitePool } from "./pglite-pool";

/*
 * Real Better Auth on a real PostgreSQL engine (PGlite, in-process) with all project migrations,
 * driven through its HTTP handler exactly like the browser does. Emails are captured instead of
 * sent. Not covered here: the `pg` driver, a PostgreSQL server, real SMTP delivery and Google.
 */

export const BASE_URL = "http://localhost:3000";

export type Harness = {
  auth: Auth;
  db: PGlite;
  outbox: EmailMessage[];
  request(
    path: string,
    init?: { method?: string; body?: unknown; cookie?: string; origin?: string; ip?: string },
  ): Promise<Response>;
  close(): Promise<void>;
};

export async function createHarness({ rateLimit = false } = {}): Promise<Harness> {
  const db = new PGlite();
  await runMigrations(
    {
      singleConnection: true,
      query: async (text, params = []) => ({
        rows: (await db.query(text, [...params])).rows as never[],
      }),
      exec: async (text) => void (await db.exec(text)),
    },
    loadMigrations(),
  );
  const outbox: EmailMessage[] = [];
  const auth = createAuth({
    dialect: new PostgresDialect({ pool: pglitePool(db) as never }),
    secret: "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
    baseURL: BASE_URL,
    emailSender: { send: async (message) => void outbox.push(message) },
    google: null,
    production: false,
    rateLimit,
  });
  return {
    auth,
    db,
    outbox,
    request(path, init = {}) {
      const headers: Record<string, string> = { origin: init.origin ?? BASE_URL };
      if (init.body !== undefined) headers["content-type"] = "application/json";
      if (init.cookie) headers.cookie = init.cookie;
      if (init.ip) headers["x-forwarded-for"] = init.ip;
      return auth.handler(
        new Request(`${BASE_URL}/api/auth${path}`, {
          method: init.method ?? (init.body === undefined ? "GET" : "POST"),
          headers,
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
        }),
      );
    },
    close: () => db.close(),
  };
}

/** The session cookie ("name=value") from a response, or null. */
export function sessionCookie(response: Response): string | null {
  const cookies = response.headers.getSetCookie();
  const session = cookies.find((cookie) => cookie.includes("session_token="));
  return session ? session.split(";")[0] : null;
}

/** The first URL in an email body. */
export function linkIn(message: EmailMessage | undefined): string {
  const match = message?.text.match(/https?:\/\/\S+/);
  if (!match) throw new Error("no link in email");
  return match[0];
}
