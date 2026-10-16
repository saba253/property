// Setup and password rotation for a PostgreSQL server you installed yourself (e.g. the Windows
// installer's service on 127.0.0.1:5432). Run it in YOUR terminal; it asks for the administrator
// password without showing it and never stores or prints it.
//
//   node tools/local-dev/setup-pg-role.mjs [--port 5432] [--database property_intelligence_dev]
//   node tools/local-dev/setup-pg-role.mjs --rotate      (new password for property_app)
//
// What it does (and nothing else):
//   1. Connects as the administrator ("postgres") to 127.0.0.1 only and checks that the database
//      exists and uses UTF-8, and that schema "public" holds no tables this project did not create.
//   2. Grants CONNECT on the database and USAGE + CREATE on schema "public" to the login role
//      "property_app" (no superuser, CREATEDB or CREATEROLE), so the project's migration runner
//      creates and owns the tables; creates the empty test database "<database>_test" owned by
//      it if missing. These steps are idempotent and run BEFORE any password changes.
//   3. Creates the role with a generated password, or with --rotate sets a new one. Only a
//      SCRAM-SHA-256 verifier is sent, so the password never reaches the server or its logs.
//   4. Updates .env.local: DATABASE_URL and TEST_DATABASE_URL for property_app. Every other line
//      is kept, including AUTH_ENABLED and DATA_BACKEND (defaults postgres / false only when they
//      are missing). The previous file is copied to .env.local.backup-<timestamp>.
//   5. Checks that property_app can sign in with the new password.
//
// Crash safety of a password change: the complete new .env.local is first written to
// .env.local.rotation-pending, then the password is changed, then .env.local is replaced
// atomically (temporary file + rename) and the pending file is removed. If anything fails after
// the password changed, the pending file holds the working configuration: rename it to
// .env.local. If the password change itself fails, nothing changed and the pending file is
// removed. Data in the databases is never touched (no DROP, TRUNCATE, DELETE or ALTER TABLE).
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const HOST = "127.0.0.1";
const PORT = Number(option("port", "5432"));
const DATABASE = option("database", "property_intelligence_dev");
const TEST_DATABASE = `${DATABASE}_test`;
const ADMIN = option("admin", "postgres");
const ROLE = "property_app";
const ROTATE = args.includes("--rotate");
const root = path.resolve(import.meta.dirname, "..", "..");
const envFile = path.join(root, ".env.local");
const pendingFile = path.join(root, ".env.local.rotation-pending");

const ident = (name) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unsupported name: ${name}`);
  return `"${name}"`;
};

function fail(message, changed = "Nothing else was changed.") {
  console.error(`\nStopped: ${message}\n${changed}`);
  process.exit(1);
}

function askHidden(question) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) fail("run this in an interactive terminal (the password prompt needs one).");
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          stdout.write("\n");
          process.exit(130);
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on("data", onData);
  });
}

/** PostgreSQL's SCRAM-SHA-256 verifier format, computed locally. */
function scramVerifier(password) {
  const salt = randomBytes(16);
  const iterations = 4096;
  const salted = pbkdf2Sync(password.normalize("NFKC"), salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

async function connect(database, user, password) {
  const client = new pg.Client({ host: HOST, port: PORT, database, user, password });
  await client.connect();
  return client;
}

/** The new .env.local text: database lines replaced, everything else kept in order. */
function buildEnv(previous, password) {
  const url = (database) => `postgres://${ROLE}:${password}@${HOST}:${PORT}/${database}`;
  const lines = previous ? previous.split(/\r?\n/) : [];
  const has = (key) => lines.some((line) => line.startsWith(`${key}=`));
  const kept = lines.filter(
    (line) =>
      !/^(DATABASE_URL|TEST_DATABASE_URL)=/.test(line) &&
      !line.startsWith("# Local development only"),
  );
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  return [
    "# Local development only. Never commit. (tools/local-dev/setup-pg-role.mjs)",
    `DATABASE_URL=${url(DATABASE)}`,
    `TEST_DATABASE_URL=${url(TEST_DATABASE)}`,
    ...(has("DATA_BACKEND") ? [] : ["DATA_BACKEND=postgres"]),
    ...(has("AUTH_ENABLED")
      ? []
      : [
          "# Accounts stay off until you decide to turn them on (docs/AUTH.md).",
          "AUTH_ENABLED=false",
        ]),
    ...kept,
    "",
  ].join("\n");
}

if (existsSync(pendingFile)) {
  fail(
    ".env.local.rotation-pending exists from an earlier run that did not finish. If the app " +
      "cannot connect, rename it to .env.local; otherwise delete it. Then run this again.",
  );
}

const adminPassword = await askHidden(`Password of PostgreSQL user "${ADMIN}" (not shown): `);

let admin;
try {
  admin = await connect("postgres", ADMIN, adminPassword);
} catch (error) {
  fail(`could not connect to ${HOST}:${PORT} as "${ADMIN}" (${error.code ?? error.message}).`);
}

const version = (await admin.query("SHOW server_version")).rows[0].server_version;
console.log(`Connected: PostgreSQL ${version} on ${HOST}:${PORT}.`);
const found = await admin.query(
  "SELECT pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datname = $1",
  [DATABASE],
);
if (found.rowCount === 0) fail(`database "${DATABASE}" does not exist.`);
if (found.rows[0].encoding !== "UTF8") {
  fail(`database "${DATABASE}" uses ${found.rows[0].encoding}; Georgian text needs UTF8.`);
}
console.log(`Database "${DATABASE}" exists (UTF8).`);

const roleExists = (await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [ROLE]))
  .rowCount;
if (roleExists && !ROTATE) {
  await admin.end();
  console.log(`Role "${ROLE}" already exists; nothing to do (use --rotate for a new password).`);
  process.exit(0);
}

// A brand-new role must exist before it can receive grants; it gets its password here.
const newPassword = randomBytes(24).toString("base64url");
const literal = `'${scramVerifier(newPassword).replace(/'/g, "''")}'`;
const previous = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
const nextEnv = buildEnv(previous, newPassword);

if (!roleExists) {
  await admin.query(
    `CREATE ROLE ${ident(ROLE)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD ${literal}`,
  );
  console.log(`Created role "${ROLE}" (login only; no superuser, CREATEDB or CREATEROLE).`);
}

// Idempotent grants and the test database, before any password change.
const dbAdmin = await connect(DATABASE, ADMIN, adminPassword);
const tables = await dbAdmin.query(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name <> 'schema_migrations'`,
);
const applied = await dbAdmin.query(
  "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schema_migrations'",
);
if (tables.rowCount > 0 && applied.rowCount === 0) {
  await dbAdmin.end();
  fail(
    `schema "public" already has ${tables.rowCount} table(s) that this project did not create. ` +
      "They were not touched; tell me which data they hold before migrating.",
  );
}
await admin.query(`GRANT CONNECT ON DATABASE ${ident(DATABASE)} TO ${ident(ROLE)}`);
await dbAdmin.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${ident(ROLE)}`);
await dbAdmin.end();
console.log(`Granted CONNECT on "${DATABASE}" and USAGE, CREATE on schema public.`);
const testExists = (
  await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [TEST_DATABASE])
).rowCount;
if (!testExists) {
  await admin.query(
    `CREATE DATABASE ${ident(TEST_DATABASE)} OWNER ${ident(ROLE)} ENCODING 'UTF8' TEMPLATE template0`,
  );
  console.log(`Created empty test database "${TEST_DATABASE}" owned by "${ROLE}".`);
} else {
  console.log(`Test database "${TEST_DATABASE}" already exists; left unchanged.`);
}

// The complete new configuration exists on disk before the password changes.
writeFileSync(pendingFile, nextEnv);
if (roleExists) {
  try {
    await admin.query(`ALTER ROLE ${ident(ROLE)} PASSWORD ${literal}`);
  } catch (error) {
    rmSync(pendingFile, { force: true });
    await admin.end();
    fail(
      `the password change failed (${error.code ?? error.message}); the old password still works.`,
    );
  }
  console.log(`Set a new password for role "${ROLE}".`);
}
await admin.end();

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "");
let backupName = null;
try {
  if (previous) {
    backupName = `.env.local.backup-${stamp}`;
    copyFileSync(envFile, path.join(root, backupName));
  }
  const temporary = `${envFile}.tmp-${process.pid}`;
  writeFileSync(temporary, nextEnv);
  renameSync(temporary, envFile);
  rmSync(pendingFile, { force: true });
} catch (error) {
  fail(
    `updating .env.local failed (${error.code ?? error.message}).`,
    "The new password IS active. Rename .env.local.rotation-pending to .env.local to use it.",
  );
}
console.log(
  `Updated .env.local (DATABASE_URL and TEST_DATABASE_URL for "${ROLE}"; other settings kept` +
    `${backupName ? `; previous file saved as ${backupName}` : ""}).`,
);

try {
  const check = await connect(DATABASE, ROLE, newPassword);
  await check.end();
  console.log(`Checked: "${ROLE}" signs in with the new password.`);
} catch (error) {
  fail(
    `"${ROLE}" could not sign in with the new password (${error.code ?? error.message}).`,
    ".env.local already holds the new password; run again with --rotate if this persists.",
  );
}
console.log("Done. No password was printed. Restart npm run dev to use the new password.");
