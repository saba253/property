/*
 * Which data backend the application reads from. Server-side only: these variables never get the
 * NEXT_PUBLIC_ prefix, so Next.js never inlines them into browser code.
 *
 * - DATA_BACKEND unset or "memory": the built-in demo data (the default; no database needed).
 * - DATA_BACKEND="postgres": PostgreSQL at DATABASE_URL. If that is missing or invalid, or the
 *   database cannot be reached, requests fail with a server-side error. There is NO silent
 *   fallback to demo data, so a misconfigured deployment can never show demo listings as real.
 */

export type DataBackendConfig =
  { backend: "memory" } | { backend: "postgres"; databaseUrl: string };

/** Configuration problem. The message never contains the connection string or a password. */
export class DataConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataConfigError";
  }
}

/** The database could not be reached or a query failed; the cause is logged server-side only. */
export class DataBackendUnavailableError extends Error {
  constructor(message = "The listing database is not available.", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DataBackendUnavailableError";
  }
}

type Env = Readonly<Record<string, string | undefined>>;

/** Parses a postgres:// or postgresql:// URL; null when it is not one. */
export function parseDatabaseUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "postgres:" || url.protocol === "postgresql:" ? url : null;
  } catch {
    return null;
  }
}

/** Reads DATA_BACKEND and DATABASE_URL. Throws DataConfigError instead of guessing. */
export function resolveDataBackend(env: Env): DataBackendConfig {
  const backend = env.DATA_BACKEND?.trim().toLowerCase() || "memory";
  if (backend === "memory") return { backend: "memory" };
  if (backend !== "postgres") {
    throw new DataConfigError(`DATA_BACKEND must be "memory" or "postgres".`);
  }
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new DataConfigError("DATA_BACKEND=postgres requires DATABASE_URL.");
  }
  if (!parseDatabaseUrl(databaseUrl)) {
    throw new DataConfigError("DATABASE_URL must be a postgres:// or postgresql:// URL.");
  }
  return { backend: "postgres", databaseUrl };
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** True when the URL points at this computer (development databases only). */
export function isLocalDatabaseUrl(value: string): boolean {
  const url = parseDatabaseUrl(value);
  return url !== null && LOCAL_HOSTS.has(url.hostname);
}

/** "postgres://user@host:port/db" without the password, for script output. */
export function describeDatabaseUrl(value: string): string {
  const url = parseDatabaseUrl(value);
  if (!url) return "(invalid DATABASE_URL)";
  const user = url.username ? `${decodeURIComponent(url.username)}@` : "";
  return `${url.protocol}//${user}${url.host}${url.pathname}`;
}
