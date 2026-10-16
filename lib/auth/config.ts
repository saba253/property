import { parseDatabaseUrl } from "@/lib/db/config";

/*
 * Whether accounts can be enabled, decided only from server-side environment variables (none of
 * them has a NEXT_PUBLIC_ prefix). Authentication is OFF unless every prerequisite is present:
 * an explicit AUTH_ENABLED=true, a PostgreSQL database, a strong secret, the public base URL and
 * a working email transport (verification and password reset need email). There is no
 * in-memory or demo fallback: when anything is missing, sign-up and sign-in are unavailable and
 * the pages say so.
 */

export type AuthDisabledReason =
  | "not-enabled"
  | "missing-database-url"
  | "invalid-database-url"
  | "missing-secret"
  | "weak-secret"
  | "missing-base-url"
  | "invalid-base-url"
  | "insecure-base-url"
  | "missing-email-transport"
  | "invalid-email-transport"
  | "missing-email-from";

export type GoogleConfig = { clientId: string; clientSecret: string };

export type AuthConfig =
  | {
      enabled: true;
      databaseUrl: string;
      secret: string;
      baseURL: string;
      smtpUrl: string;
      emailFrom: string;
      /** null when GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not both set. */
      google: GoogleConfig | null;
      production: boolean;
    }
  | { enabled: false; reasons: AuthDisabledReason[] };

/** Better Auth requires a high-entropy secret; 32 characters is its documented minimum. */
export const MIN_SECRET_LENGTH = 32;

type Env = Readonly<Record<string, string | undefined>>;

const read = (env: Env, key: string) => env[key]?.trim() || undefined;

export function resolveAuthConfig(env: Env): AuthConfig {
  const reasons: AuthDisabledReason[] = [];
  const production = env.NODE_ENV === "production";

  if (read(env, "AUTH_ENABLED") !== "true") reasons.push("not-enabled");

  const databaseUrl = read(env, "DATABASE_URL");
  if (!databaseUrl) reasons.push("missing-database-url");
  else if (!parseDatabaseUrl(databaseUrl)) reasons.push("invalid-database-url");

  const secret = read(env, "BETTER_AUTH_SECRET");
  if (!secret) reasons.push("missing-secret");
  else if (secret.length < MIN_SECRET_LENGTH || new Set(secret).size < 10) {
    reasons.push("weak-secret");
  }

  const baseURL = read(env, "BETTER_AUTH_URL");
  let base: URL | null = null;
  if (!baseURL) reasons.push("missing-base-url");
  else {
    try {
      base = new URL(baseURL);
    } catch {
      base = null;
    }
    if (!base || (base.protocol !== "https:" && base.protocol !== "http:")) {
      reasons.push("invalid-base-url");
    } else if (production && base.protocol !== "https:") {
      // Secure cookies need HTTPS; plain HTTP is accepted for local development only.
      reasons.push("insecure-base-url");
    }
  }

  const smtpUrl = read(env, "AUTH_SMTP_URL");
  if (!smtpUrl) reasons.push("missing-email-transport");
  else if (!/^smtps?:\/\//.test(smtpUrl)) reasons.push("invalid-email-transport");
  const emailFrom = read(env, "AUTH_EMAIL_FROM");
  if (!emailFrom) reasons.push("missing-email-from");

  if (reasons.length > 0) return { enabled: false, reasons };

  const clientId = read(env, "GOOGLE_CLIENT_ID");
  const clientSecret = read(env, "GOOGLE_CLIENT_SECRET");
  return {
    enabled: true,
    databaseUrl: databaseUrl!,
    secret: secret!,
    baseURL: base!.origin,
    smtpUrl: smtpUrl!,
    emailFrom: emailFrom!,
    google: clientId && clientSecret ? { clientId, clientSecret } : null,
    production,
  };
}

/** Developer-facing explanations (server logs and docs), without any secret values. */
export const AUTH_DISABLED_REASON_TEXT: Record<AuthDisabledReason, string> = {
  "not-enabled": "AUTH_ENABLED is not set to true.",
  "missing-database-url": "DATABASE_URL is missing (accounts need PostgreSQL).",
  "invalid-database-url": "DATABASE_URL is not a postgres:// URL.",
  "missing-secret": "BETTER_AUTH_SECRET is missing.",
  "weak-secret": `BETTER_AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} random characters.`,
  "missing-base-url": "BETTER_AUTH_URL is missing.",
  "invalid-base-url": "BETTER_AUTH_URL is not an http(s) URL.",
  "insecure-base-url": "BETTER_AUTH_URL must use https in production.",
  "missing-email-transport": "AUTH_SMTP_URL is missing (verification and reset emails).",
  "invalid-email-transport": "AUTH_SMTP_URL must start with smtp:// or smtps://.",
  "missing-email-from": "AUTH_EMAIL_FROM is missing.",
};
