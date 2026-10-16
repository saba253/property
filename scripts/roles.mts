/*
 * Moderator and administrator roles for LOCAL DEVELOPMENT (see docs/MODERATION.md). The only way
 * to grant a role: there is no page, API or self-service for it.
 *   npm run roles -- list
 *   npm run roles -- grant <email>         moderator; the account must exist and be verified
 *   npm run roles -- revoke <email>        moderator (also ends administrator privileges)
 *   npm run roles -- grant-admin <email>   administrator = 'admin' + 'moderator' (verified only)
 *   npm run roles -- revoke-admin <email>  administrator only; the moderator role stays
 * The target is DATABASE_URL from the environment or .env.local; non-local hosts are refused.
 */
import { existsSync } from "node:fs";
import { describeDatabaseUrl, isLocalDatabaseUrl, parseDatabaseUrl } from "@/lib/db/config";
import { connectPg } from "@/lib/db/pg-client";

const [command, emailArg] = process.argv.slice(2);

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl || !parseDatabaseUrl(databaseUrl))
  fail("DATABASE_URL is not set. Nothing was changed.");
if (!isLocalDatabaseUrl(databaseUrl)) fail(`${describeDatabaseUrl(databaseUrl)} is not local.`);
if (!["list", "grant", "revoke", "grant-admin", "revoke-admin"].includes(command ?? "")) {
  fail(
    "Usage: npm run roles -- list | grant <email> | revoke <email> | grant-admin <email> | revoke-admin <email>",
  );
}
const email = emailArg?.trim().toLowerCase();
if (command !== "list" && (!email || !/^[^\s@]+@[^\s@]+$/.test(email))) fail("Give an email.");

const db = await connectPg(databaseUrl).catch((error: Error) =>
  fail(`could not connect (${error.message}).`),
);
try {
  if (command === "list") {
    const { rows } = await db.query<{ email: string; roles: string; granted_at: string }>(
      `SELECT u.email, string_agg(r.role, ' + ' ORDER BY r.role DESC) AS roles,
              to_char(min(r.granted_at), 'YYYY-MM-DD HH24:MI') AS granted_at
       FROM user_roles r JOIN users u ON u.id = r.user_id GROUP BY u.email ORDER BY u.email`,
    );
    console.log(
      rows.length
        ? rows.map((r) => `${r.email}  ${r.roles}  (since ${r.granted_at})`).join("\n")
        : "No moderators.",
    );
  } else {
    const { rows } = await db.query<{ id: string; verified: boolean }>(
      `SELECT id, "emailVerified" AS verified FROM users WHERE lower(email) = $1`,
      [email],
    );
    const user = rows[0];
    if (!user) fail("No account with this email. Nothing was changed.");
    if (command === "grant-admin") {
      if (!user.verified) fail("The email of this account is not verified. Nothing was changed.");
      // One statement: both rows or neither.
      const result = await db.query<{ role: string }>(
        `INSERT INTO user_roles (user_id, role) VALUES ($1, 'moderator'), ($1, 'admin')
         ON CONFLICT DO NOTHING RETURNING role`,
        [user.id],
      );
      console.log(
        result.rows.some((r) => r.role === "admin")
          ? "Administrator role granted (with the moderator role)."
          : "Already an administrator.",
      );
    } else if (command === "revoke-admin") {
      const result = await db.query<{ user_id: string }>(
        "DELETE FROM user_roles WHERE user_id = $1 AND role = 'admin' RETURNING user_id",
        [user.id],
      );
      console.log(result.rows.length ? "Administrator role revoked." : "Was not an administrator.");
    } else if (command === "grant") {
      if (!user.verified) fail("The email of this account is not verified. Nothing was changed.");
      const result = await db.query<{ user_id: string }>(
        `INSERT INTO user_roles (user_id, role) VALUES ($1, 'moderator')
         ON CONFLICT DO NOTHING RETURNING user_id`,
        [user.id],
      );
      console.log(result.rows.length ? "Moderator role granted." : "Already a moderator.");
    } else {
      const result = await db.query<{ user_id: string }>(
        "DELETE FROM user_roles WHERE user_id = $1 AND role = 'moderator' RETURNING user_id",
        [user.id],
      );
      console.log(result.rows.length ? "Moderator role revoked." : "Was not a moderator.");
    }
  }
} finally {
  await db.end();
}
