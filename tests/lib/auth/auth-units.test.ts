import { describe, expect, it } from "vitest";
import { MIN_SECRET_LENGTH, resolveAuthConfig } from "@/lib/auth/config";
import { existingAccountEmail, passwordResetEmail, verificationEmail } from "@/lib/auth/email";
import { DEFAULT_AFTER_LOGIN, safeRedirectPath } from "@/lib/auth/redirect";
import {
  AUTH_MESSAGES,
  MIN_PASSWORD_LENGTH,
  isValidEmail,
  normalizeEmail,
  validateRegistration,
} from "@/lib/auth/validation";

const SECRET = "k3Vq9Zp2Lr7Xw4Nt8Hs1Bd6Fg0Jm5Cy-_aeiou"; // test value, not a real secret
const COMPLETE = {
  AUTH_ENABLED: "true",
  DATABASE_URL: "postgres://app@localhost:5432/property_dev",
  BETTER_AUTH_SECRET: SECRET,
  BETTER_AUTH_URL: "http://localhost:3000",
  AUTH_SMTP_URL: "smtp://localhost:1025",
  AUTH_EMAIL_FROM: "Property Intelligence <no-reply@example.com>",
};

describe("authentication configuration gate", () => {
  it("is off by default, with every missing prerequisite listed", () => {
    const config = resolveAuthConfig({});
    expect(config.enabled).toBe(false);
    if (config.enabled) return;
    expect(config.reasons).toEqual([
      "not-enabled",
      "missing-database-url",
      "missing-secret",
      "missing-base-url",
      "missing-email-transport",
      "missing-email-from",
    ]);
  });

  it("turns on only with everything present, and never by itself", () => {
    expect(resolveAuthConfig(COMPLETE)).toMatchObject({ enabled: true, google: null });
    // Every prerequisite is needed: no partial or in-memory mode.
    for (const key of Object.keys(COMPLETE)) {
      expect(resolveAuthConfig({ ...COMPLETE, [key]: "" }).enabled, key).toBe(false);
    }
  });

  it("rejects weak secrets, bad URLs, non-SMTP transports and plain HTTP in production", () => {
    const reasons = (env: Record<string, string>) => {
      const config = resolveAuthConfig({ ...COMPLETE, ...env });
      return config.enabled ? [] : config.reasons;
    };
    expect(reasons({ BETTER_AUTH_SECRET: "short" })).toEqual(["weak-secret"]);
    expect(reasons({ BETTER_AUTH_SECRET: "a".repeat(MIN_SECRET_LENGTH + 5) })).toEqual([
      "weak-secret",
    ]);
    expect(reasons({ DATABASE_URL: "mysql://x" })).toEqual(["invalid-database-url"]);
    expect(reasons({ BETTER_AUTH_URL: "ftp://x" })).toEqual(["invalid-base-url"]);
    expect(reasons({ AUTH_SMTP_URL: "https://mail.example" })).toEqual(["invalid-email-transport"]);
    expect(reasons({ NODE_ENV: "production" })).toEqual(["insecure-base-url"]);
    expect(reasons({ NODE_ENV: "production", BETTER_AUTH_URL: "https://example.ge" })).toEqual([]);
  });

  it("enables Google only with both credentials", () => {
    expect(resolveAuthConfig({ ...COMPLETE, GOOGLE_CLIENT_ID: "id" })).toMatchObject({
      google: null,
    });
    expect(
      resolveAuthConfig({ ...COMPLETE, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s" }),
    ).toMatchObject({ google: { clientId: "id", clientSecret: "s" } });
    // Without accounts, Google is off too.
    expect(resolveAuthConfig({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s" }).enabled).toBe(
      false,
    );
  });
});

describe("account input validation", () => {
  it("normalizes and validates emails", () => {
    expect(normalizeEmail("  Nino@Example.COM ")).toBe("nino@example.com");
    expect(isValidEmail("nino@example.com")).toBe(true);
    for (const bad of [
      "",
      "nino",
      "nino@",
      "@example.com",
      "ni no@example.com",
      "nino@example",
      `${"a".repeat(250)}@x.ge`,
    ]) {
      expect(isValidEmail(bad), bad).toBe(false);
    }
  });

  it("applies the password and name policy with Georgian messages", () => {
    expect(
      validateRegistration({ email: "a@b.ge", password: "x".repeat(MIN_PASSWORD_LENGTH) }),
    ).toEqual({});
    expect(
      validateRegistration({
        email: "nope",
        password: "short",
        passwordConfirm: "different",
        name: "ა".repeat(61),
      }),
    ).toEqual({
      email: AUTH_MESSAGES.invalidEmail,
      password: AUTH_MESSAGES.passwordTooShort,
      passwordConfirm: AUTH_MESSAGES.passwordMismatch,
      name: AUTH_MESSAGES.nameTooLong,
    });
  });
});

describe("safe redirects after sign-in", () => {
  it("keeps paths on this site", () => {
    expect(safeRedirectPath("/favorites")).toBe("/favorites");
    expect(safeRedirectPath("/properties?transaction=rent&page=2")).toBe(
      "/properties?transaction=rent&page=2",
    );
    expect(safeRedirectPath(undefined)).toBe(DEFAULT_AFTER_LOGIN);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "%2F%2Fevil.example",
    "/%2Fevil.example",
    "javascript:alert(1)",
    "/api/auth/sign-out",
    "favorites",
    "/x\u0000y",
    `/${"a".repeat(600)}`,
  ])("refuses %s", (value) => {
    expect(safeRedirectPath(value)).toBe(DEFAULT_AFTER_LOGIN);
  });
});

describe("account emails", () => {
  it("are Georgian, carry only the link, and never a password", () => {
    const url = "http://localhost:3000/api/auth/verify-email?token=abc";
    for (const message of [
      verificationEmail("a@b.ge", url),
      passwordResetEmail("a@b.ge", url),
      existingAccountEmail("a@b.ge", "http://localhost:3000/login"),
    ]) {
      expect(message.to).toBe("a@b.ge");
      expect(message.text).toMatch(/[ა-ჰ]/);
      expect(message.text.toLowerCase()).not.toContain("password:");
    }
    expect(verificationEmail("a@b.ge", url).text).toContain(url);
  });
});
