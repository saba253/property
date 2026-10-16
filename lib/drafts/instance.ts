import "server-only";
import pg from "pg";
import { getAuthStatus, getCurrentSession } from "@/lib/auth/instance";
import { resolveAuthConfig } from "@/lib/auth/config";
import type { DraftDeps } from "@/lib/drafts/draft-service";

/*
 * Server wiring for drafts: the signed-in user from Better Auth's session (validated in the
 * database) and a small `pg` pool on the accounts database. Drafts exist only while accounts are
 * enabled; otherwise every operation reports "not signed in".
 */

const holder = globalThis as typeof globalThis & { __propertyDraftPool?: pg.Pool };

function pool(): pg.Pool {
  const config = resolveAuthConfig(process.env);
  if (!config.enabled) throw new Error("Accounts are not enabled");
  holder.__propertyDraftPool ??= new pg.Pool({
    connectionString: config.databaseUrl,
    max: 3,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
    application_name: "property-intelligence-drafts",
  });
  return holder.__propertyDraftPool;
}

export const draftDeps: DraftDeps = {
  async currentUserId() {
    if (!getAuthStatus().enabled) return null;
    const session = await getCurrentSession();
    // Better Auth creates sessions only for verified emails (requireEmailVerification).
    return session?.user.emailVerified ? session.user.id : null;
  },
  async withConnection(work) {
    const client = await pool().connect();
    try {
      return await work({
        singleConnection: true,
        async query<Row extends object>(text: string, params: readonly unknown[] = []) {
          const result = await client.query(text, [...params]);
          return { rows: result.rows as Row[] };
        },
        async exec(text: string) {
          await client.query(text);
        },
      });
    } finally {
      client.release();
    }
  },
};
