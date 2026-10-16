/*
 * Moderator roles for LOCAL DEVELOPMENT (see docs/MODERATION.md). The only way to grant a role:
 * there is no page, API or self-service for it.
 *   npm run roles -- list
 *   npm run roles -- grant <email>     the account must exist and have a verified email
 *   npm run roles -- revoke <email>
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
if (!["list", "grant", "revoke"].includes(command ?? "")) {
  fail("Usage: npm run roles -- list | grant <email> | revoke <email>");
}
const email = emailArg?.trim().toLowerCase();
if (command !== "list" && (!email || !/^[^\s@]+@[^\s@]+$/.test(email))) fail("Give an email.");

const db = await connectPg(databaseUrl).catch((error: Error) =>
  fail(`could not connect (${error.message}).`),
);
try {
  if (command === "list") {
    const { rows } = await db.query<{ email: string; granted_at: string }>(
      `SELECT u.email, to_char(r.granted_at, 'YYYY-MM-DD HH24:MI') AS granted_at
       FROM user_roles r JOIN users u ON u.id = r.user_id WHERE r.role = 'moderator' ORDER BY u.email`,
    );
    console.log(
      rows.length
        ? rows.map((r) => `${r.email}  (since ${r.granted_at})`).join("\n")
        : "No moderators.",
    );
  } else {
    const { rows } = await db.query<{ id: string; verified: boolean }>(
      `SELECT id, "emailVerified" AS verified FROM users WHERE lower(email) = $1`,
      [email],
    );
    const user = rows[0];
    if (!user) fail("No account with this email. Nothing was changed.");
    if (command === "grant") {
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
