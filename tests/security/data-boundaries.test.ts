import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Static checks of the data-access boundaries: database code and credentials stay on the server,
 * and pages read listings through the repository rather than the demo arrays.
 */

const root = join(__dirname, "..", "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

const source = (path: string) => readFileSync(path, "utf8");
/** Source without comments, for checks about what the code does (not what comments say). */
const code = (path: string) =>
  source(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const all = ["app", "components", "lib"].flatMap((dir) => files(join(root, dir)));
const isClient = (path: string) => /^\s*["']use client["']/.test(source(path));

describe("data access boundaries", () => {
  it("keeps database code, the pg driver and the data layer out of client components", () => {
    const clientFiles = all.filter(isClient);
    expect(clientFiles.length).toBeGreaterThan(5);
    for (const file of clientFiles) {
      const text = source(file);
      expect(text, file).not.toMatch(
        /from "(pg|@\/lib\/db\/[^"]+|@\/lib\/data\/[^"]+|@\/lib\/repository\/[^"]+)"/,
      );
      expect(text, file).not.toContain("DATABASE_URL");
    }
  });

  it("sends no listing catalog with every page and keeps the API on the data layer", () => {
    // The layout renders on every page; the comparison tray loads its few listings itself.
    expect(source(join(root, "app", "layout.tsx"))).not.toMatch(/@\/lib\/(data|repository)\//);
    const route = source(join(root, "app", "api", "listings", "summaries", "route.ts"));
    expect(route).toContain('from "@/lib/data/listings"');
    expect(route).not.toMatch(/from "(pg|@\/lib\/db\/[^"]+)"/);
    expect(route).not.toMatch(/export (async )?function (PUT|PATCH|DELETE)/);
  });

  it("keeps authentication secrets and the auth server on the server", () => {
    for (const file of all.filter(isClient)) {
      const text = source(file);
      expect(text, file).not.toMatch(/from "@\/lib\/auth\/(server|instance|email|config)"/);
      expect(text, file).not.toMatch(/BETTER_AUTH_SECRET|GOOGLE_CLIENT_SECRET|AUTH_SMTP_URL/);
    }
    expect(source(join(root, "lib", "auth", "instance.ts"))).toMatch(/^import "server-only";/);
  });

  it("never keeps sessions, tokens or passwords in browser storage, and leaves selections alone", () => {
    for (const file of files(join(root, "components", "auth"))) {
      const text = code(file);
      expect(text, file).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
    }
  });

  it("never lets the browser submit account forms itself (passwords in the URL)", () => {
    // Found in browser testing: a click before hydration made the browser send the login form
    // as GET, so the password ended up in the address bar. Every account form posts (body, not
    // URL) and keeps its submit button disabled until React handles the submit.
    let forms = 0;
    for (const file of files(join(root, "components", "auth"))) {
      const text = code(file);
      for (const tag of text.match(/<form\b[^>]*>/g) ?? []) {
        forms += 1;
        expect(tag, file).toContain('method="post"');
      }
      for (const button of text.match(/<button\s[^>]*type="submit"[^>]*>/g) ?? []) {
        expect(button, file).toContain("!hydrated");
      }
    }
    expect(forms).toBeGreaterThanOrEqual(5);
  });

  it("never caches or prerenders account data", () => {
    for (const page of ["account", "login", "register", "forgot-password", "reset-password"]) {
      const text = source(join(root, "app", page, "page.tsx"));
      expect(code(join(root, "app", page, "page.tsx")), page).not.toContain('"use cache"');
      expect(text, page).toContain("connection()");
      expect(text, page).toMatch(/robots: \{ index: false, follow: false \}/);
    }
    const status = source(join(root, "app", "api", "account", "status", "route.ts"));
    expect(status).toContain("private, no-store");
    // A GET route without request-time APIs would be prerendered once and shared by everyone.
    expect(code(join(root, "app", "api", "account", "status", "route.ts"))).toContain(
      "await connection()",
    );
    expect(status).not.toContain("session.token");
  });

  it("keeps the private draft store on the server and the draft pages private", () => {
    for (const file of all.filter(isClient)) {
      expect(source(file), file).not.toMatch(
        /from "@\/lib\/drafts\/(draft-store|draft-service|instance)"/,
      );
    }
    expect(source(join(root, "lib", "drafts", "instance.ts"))).toMatch(/^import "server-only";/);
    expect(source(join(root, "app", "account", "listings", "actions.ts"))).toMatch(
      /^"use server";/,
    );
    for (const page of [
      join(root, "app", "account", "listings", "page.tsx"),
      join(root, "app", "account", "listings", "edit", "page.tsx"),
    ]) {
      expect(code(page), page).toContain("connection()");
      expect(code(page), page).not.toContain('"use cache"');
      expect(source(page), page).toMatch(/robots: \{ index: false, follow: false \}/);
    }
    // Draft SQL also uses parameters only.
    for (const file of files(join(root, "lib", "drafts"))) {
      const sqlLines = source(file)
        .split("\n")
        .filter((l) => /\b(SELECT|INSERT|UPDATE|DELETE|WHERE|VALUES|SET)\b/.test(l));
      for (const line of sqlLines) {
        expect(line, file).not.toMatch(
          /\$\{(input|draft|item|ownerId|userId|listingId|draftId)[.}]/,
        );
      }
    }
  });

  it("marks the page data module as server-only", () => {
    expect(source(join(root, "lib", "data", "listings.ts"))).toMatch(/^import "server-only";/);
  });

  it("never exposes database settings with a NEXT_PUBLIC_ prefix", () => {
    for (const file of [...all, join(root, ".env.example"), join(root, "next.config.ts")]) {
      expect(source(file), file).not.toMatch(/NEXT_PUBLIC_(DATABASE|DATA_BACKEND|PG)/);
    }
  });

  it("lets only the repository and the seed read the demo arrays", () => {
    const allowed = new Set([
      "lib/properties/get-demo-listing.ts",
      "lib/repository/memory-repository.ts",
    ]);
    for (const file of all) {
      const path = relative(root, file).replace(/\\/g, "/");
      if (allowed.has(path)) continue;
      expect(source(file), path).not.toMatch(/from "@\/lib\/properties\/demo-(data|images)"/);
    }
    for (const file of files(join(root, "app"))) {
      expect(source(file), file).not.toMatch(
        /^import \{[^}]*\} from "@\/lib\/properties\/get-demo-listing"/m,
      );
    }
  });

  it("builds SQL only from parameters, never by inserting values into the text", () => {
    for (const file of files(join(root, "lib", "db"))) {
      // No template-literal interpolation of values: only ${params.add(...)} placeholders, fixed
      // SQL fragments and column lists may appear inside SQL. (Error messages are not SQL.)
      const lines = source(file)
        .split("\n")
        .filter((line) => !line.includes("Error("));
      for (const line of lines) {
        expect(line, file).not.toMatch(
          /\$\{(filters|query|search|subject|listing|property|raw)\.[^}]*\}/,
        );
      }
    }
  });

  it("documents configuration without real secrets", () => {
    const example = source(join(root, ".env.example"));
    expect(example).toContain("DATA_BACKEND=memory");
    expect(example).not.toMatch(/postgres(ql)?:\/\/[^\s:@]+:[^\s@]+@(?!localhost|127\.0\.0\.1)/);
  });
});
