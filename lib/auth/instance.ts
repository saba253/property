import "server-only";
import { headers } from "next/headers";
import { PostgresDialect } from "kysely";
import pg from "pg";
import { AUTH_DISABLED_REASON_TEXT, resolveAuthConfig } from "@/lib/auth/config";
import { createSmtpSender } from "@/lib/auth/email";
import { type Auth, createAuth } from "@/lib/auth/server";

/*
 * The application's Better Auth instance, created once per server process from the environment
 * (see lib/auth/config.ts). Returns null while accounts are not configured; nothing falls back to
 * an in-memory or demo login. Server-only: secrets and the database never reach the browser.
 */

const holder = globalThis as typeof globalThis & {
  __propertyAuth?: Auth;
  __propertyAuthWarned?: boolean;
};

/** Whether accounts are on, and whether Google sign-in is configured (no secret values). */
export function getAuthStatus(): { enabled: boolean; google: boolean } {
  const config = resolveAuthConfig(process.env);
  return { enabled: config.enabled, google: config.enabled && config.google !== null };
}

export function getAuth(): Auth | null {
  const config = resolveAuthConfig(process.env);
  if (!config.enabled) {
    if (!holder.__propertyAuthWarned) {
      holder.__propertyAuthWarned = true;
      console.info(
        "[auth] Accounts are disabled: " +
          config.reasons.map((reason) => AUTH_DISABLED_REASON_TEXT[reason]).join(" "),
      );
    }
    return null;
  }
  holder.__propertyAuth ??= createAuth({
    dialect: new PostgresDialect({
      pool: new pg.Pool({
        connectionString: config.databaseUrl,
        max: 5,
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 30_000,
        statement_timeout: 10_000,
        application_name: "property-intelligence-auth",
      }),
    }),
    secret: config.secret,
    baseURL: config.baseURL,
    emailSender: createSmtpSender(config.smtpUrl, config.emailFrom),
    google: config.google,
    production: config.production,
  });
  return holder.__propertyAuth;
}

/** The signed-in visitor of this request (validated in the database), or null. */
export async function getCurrentSession() {
  const auth = getAuth();
  if (!auth) return null;
  return auth.api.getSession({ headers: await headers() });
}
