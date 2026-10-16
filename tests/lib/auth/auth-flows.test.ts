import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Harness, createHarness, linkIn, sessionCookie } from "./auth-harness";

/*
 * End-to-end account flows through Better Auth's HTTP handler on PGlite (real PostgreSQL SQL).
 * What this does NOT cover: the `pg` driver against a PostgreSQL server, SMTP delivery, Google.
 */

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
}, 60_000);
afterAll(() => h.close());

const PASSWORD = "correct-horse-battery";

async function register(email: string, password = PASSWORD, name = "") {
  return h.request("/sign-up/email", { body: { email, password, name, callbackURL: "/account" } });
}

async function verify(email: string) {
  const message = [...h.outbox]
    .reverse()
    .find((m) => m.to === email && m.subject.includes("დაადასტურეთ"));
  const response = await h.request(
    new URL(linkIn(message)).pathname.replace("/api/auth", "") + new URL(linkIn(message)).search,
  );
  return response;
}

async function signIn(email: string, password = PASSWORD) {
  return h.request("/sign-in/email", { body: { email, password } });
}

describe("registration", () => {
  it("creates an unverified user with a hashed password and sends a verification email", async () => {
    const response = await register("Nino@Example.COM", PASSWORD, "ნინო");
    expect(response.status).toBe(200);
    const { rows } = await h.db.query<{ email: string; emailVerified: boolean; name: string }>(
      `SELECT email, "emailVerified", name FROM users`,
    );
    // Stored lower-case and unverified.
    expect(rows).toEqual([{ email: "nino@example.com", emailVerified: false, name: "ნინო" }]);
    const account = await h.db.query<{ password: string; providerId: string }>(
      `SELECT password, "providerId" FROM accounts`,
    );
    expect(account.rows[0].providerId).toBe("credential");
    expect(account.rows[0].password).not.toContain(PASSWORD);
    expect(account.rows[0].password.length).toBeGreaterThan(40);
    expect(h.outbox.at(-1)).toMatchObject({
      to: "nino@example.com",
      subject: "დაადასტურეთ ელფოსტა",
    });
    // No session before verification.
    expect(sessionCookie(response)).toBeNull();
  });

  it("answers a duplicate registration like a new one, without a second user", async () => {
    const before = h.outbox.length;
    const response = await register("nino@example.com", "another-password-123");
    expect(response.status).toBe(200);
    const { rows } = await h.db.query<{ n: number }>("SELECT count(*)::int AS n FROM users");
    expect(rows[0].n).toBe(1);
    // The owner is told instead of the visitor (no account enumeration).
    expect(h.outbox.slice(before).map((m) => m.subject)).toContain(
      "ამ ელფოსტით ანგარიში უკვე არსებობს",
    );
  });

  it("rejects invalid input on the server", async () => {
    expect((await register("not-an-email")).status).toBe(400);
    // The forms trim before sending (normalizeEmail); unnormalized input is refused, not guessed.
    expect((await register(" spaced@example.com ")).status).toBe(400);
    expect((await register("short@example.com", "123")).status).toBe(400);
    expect((await register("long@example.com", PASSWORD, "ა".repeat(61))).status).toBe(400);
    expect((await register("x@example.com", "y".repeat(129))).status).toBe(400);
  });
});

describe("verification and sign-in", () => {
  it("refuses sign-in before verification and resends the link", async () => {
    const before = h.outbox.length;
    const response = await signIn("nino@example.com");
    expect(response.status).toBe(403);
    expect(sessionCookie(response)).toBeNull();
    expect(h.outbox.length).toBeGreaterThan(before);
  });

  it("rejects an invalid verification token", async () => {
    const response = await h.request("/verify-email?token=not-a-real-token");
    expect([302, 400, 401]).toContain(response.status);
    const { rows } = await h.db.query<{ v: boolean }>(`SELECT "emailVerified" AS v FROM users`);
    expect(rows[0].v).toBe(false);
  });

  it("verifies the email through the emailed link", async () => {
    const response = await verify("nino@example.com");
    expect([200, 302]).toContain(response.status);
    const { rows } = await h.db.query<{ v: boolean }>(`SELECT "emailVerified" AS v FROM users`);
    expect(rows[0].v).toBe(true);
  });

  it("gives the same generic error for a wrong password and an unknown email", async () => {
    const wrong = await signIn("nino@example.com", "wrong-password-123");
    const unknown = await signIn("nobody@example.com", "wrong-password-123");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect((await wrong.json()).code).toBe((await unknown.json()).code);
  });

  it("signs in with an HttpOnly, SameSite=Lax session cookie stored server-side", async () => {
    const response = await signIn("NINO@example.com");
    expect(response.status).toBe(200);
    const raw = response.headers.getSetCookie().find((c) => c.includes("session_token="))!;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain(PASSWORD);
    const { rows } = await h.db.query<{ n: number }>("SELECT count(*)::int AS n FROM sessions");
    expect(rows[0].n).toBe(1);
  });
});

describe("sessions", () => {
  it("validates the session on the server and invalidates it on sign-out", async () => {
    const cookie = sessionCookie(await signIn("nino@example.com"))!;
    const session = await h.auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.email).toBe("nino@example.com");
    const out = await h.request("/sign-out", { body: {}, cookie });
    expect(out.status).toBe(200);
    expect(await h.auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  });

  it("rejects expired sessions", async () => {
    const cookie = sessionCookie(await signIn("nino@example.com"))!;
    await h.db.query(`UPDATE sessions SET "expiresAt" = now() - interval '1 minute'`);
    expect(await h.auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  });

  it("rejects a forged cookie and requests from other origins", async () => {
    const forged = "better-auth.session_token=forged.value";
    expect(await h.auth.api.getSession({ headers: new Headers({ cookie: forged }) })).toBeNull();
    const response = await h.request("/sign-in/email", {
      body: { email: "nino@example.com", password: PASSWORD },
      origin: "https://evil.example",
    });
    expect(response.status).toBe(403);
    expect(sessionCookie(response)).toBeNull();
  });

  it("updates the display name only for the signed-in user", async () => {
    expect((await h.request("/update-user", { body: { name: "სხვა" } })).status).toBe(401);
    const cookie = sessionCookie(await signIn("nino@example.com"))!;
    expect((await h.request("/update-user", { body: { name: "ნინო ბ." }, cookie })).status).toBe(
      200,
    );
    const { rows } = await h.db.query<{ name: string }>("SELECT name FROM users");
    expect(rows[0].name).toBe("ნინო ბ.");
  });
});

describe("password reset", () => {
  it("answers unknown emails generically without sending anything", async () => {
    const before = h.outbox.length;
    const response = await h.request("/request-password-reset", {
      body: { email: "nobody@example.com", redirectTo: "/reset-password" },
    });
    expect(response.status).toBe(200);
    expect(h.outbox.length).toBe(before);
  });

  it("resets with a one-time token, revokes sessions and replaces the password", async () => {
    const oldCookie = sessionCookie(await signIn("nino@example.com"))!;
    const response = await h.request("/request-password-reset", {
      body: { email: "nino@example.com", redirectTo: "/reset-password" },
    });
    expect(response.status).toBe(200);
    const message = h.outbox.at(-1)!;
    expect(message.subject).toBe("პაროლის აღდგენა");
    // The emailed link goes through Better Auth, which redirects to /reset-password?token=...
    const link = new URL(linkIn(message));
    const redirect = await h.request(link.pathname.replace("/api/auth", "") + link.search);
    const target = new URL(redirect.headers.get("location")!, "http://localhost:3000");
    expect(target.pathname).toBe("/reset-password");
    const token = target.searchParams.get("token")!;
    expect(token).toBeTruthy();

    const newPassword = "new-correct-password-42";
    expect((await h.request("/reset-password", { body: { token, newPassword } })).status).toBe(200);
    // Token is single-use; old sessions are gone; only the new password works.
    expect(
      (await h.request("/reset-password", { body: { token, newPassword: "again-password-1" } }))
        .status,
    ).toBe(400);
    expect(await h.auth.api.getSession({ headers: new Headers({ cookie: oldCookie }) })).toBeNull();
    expect((await signIn("nino@example.com", PASSWORD)).status).toBe(401);
    expect((await signIn("nino@example.com", newPassword)).status).toBe(200);
  });

  it("refuses an expired reset token", async () => {
    await h.request("/request-password-reset", {
      body: { email: "nino@example.com", redirectTo: "/reset-password" },
    });
    const link = new URL(linkIn(h.outbox.at(-1)));
    const token = link.pathname.split("/").at(-1)!;
    await h.db.query(`UPDATE verifications SET "expiresAt" = now() - interval '1 minute'`);
    const response = await h.request("/reset-password", {
      body: { token, newPassword: "expired-attempt-123" },
    });
    expect(response.status).toBe(400);
  });
});
