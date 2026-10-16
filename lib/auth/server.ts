import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import type { Dialect } from "kysely";
import type { GoogleConfig } from "@/lib/auth/config";
import {
  type EmailMessage,
  type EmailSender,
  existingAccountEmail,
  passwordResetEmail,
  verificationEmail,
} from "@/lib/auth/email";
import {
  MAX_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  normalizeName,
  validateRegistration,
} from "@/lib/auth/validation";

/*
 * The Better Auth instance (accounts, sessions, email verification, password reset, optional
 * Google sign-in). Security-relevant choices, all using Better Auth's own mechanisms:
 * - Passwords: Better Auth's scrypt hashing; 10–128 characters; never logged.
 * - Email verification is required before the first sign-in; no automatic sign-in after sign-up.
 * - Duplicate sign-ups get the same answer as new ones (Better Auth's enumeration protection);
 *   the existing owner receives an email instead.
 * - Sessions live in the database (cookie cache off), expire after 7 days, are deleted on sign-out
 *   and all other sessions are revoked on a password reset.
 * - Cookies: HttpOnly, SameSite=Lax, Secure in production; origin checks for state-changing
 *   requests (trustedOrigins); OAuth state is verified by Better Auth.
 * - Rate limits are stored in the database (shared by all server instances).
 * - Account linking keeps Better Auth's safe defaults (no linking into unverified local accounts).
 * - Telemetry off. Email change and account deletion are not offered yet.
 * This file has no Next.js imports, so tests can run it against PGlite.
 */

export type CreateAuthOptions = {
  dialect: Dialect;
  secret: string;
  baseURL: string;
  emailSender: EmailSender;
  google: GoogleConfig | null;
  production: boolean;
  /** Rate limiting (on by default; tests may turn it off for unrelated flows). */
  rateLimit?: boolean;
};

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

export function createAuth(options: CreateAuthOptions) {
  const { emailSender, baseURL } = options;

  /** Email failures must not reveal anything to the visitor or leak links into logs. */
  async function send(message: EmailMessage) {
    try {
      await emailSender.send(message);
    } catch (error) {
      console.error(
        "[auth] email could not be sent:",
        error instanceof Error ? error.name : "unknown error",
      );
    }
  }

  return betterAuth({
    appName: "Property Intelligence",
    baseURL,
    secret: options.secret,
    trustedOrigins: [baseURL],
    database: { dialect: options.dialect, type: "postgres" },
    telemetry: { enabled: false },

    user: {
      modelName: "users",
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
    },
    session: {
      modelName: "sessions",
      expiresIn: 7 * DAY,
      updateAge: DAY,
      cookieCache: { enabled: false },
    },
    account: {
      modelName: "accounts",
      accountLinking: { enabled: true, trustedProviders: [] },
    },
    verification: { modelName: "verifications" },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      resetPasswordTokenExpiresIn: HOUR,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) => send(passwordResetEmail(user.email, url)),
      onExistingUserSignUp: ({ user }) =>
        send(existingAccountEmail(user.email, `${baseURL}/login`)),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      expiresIn: HOUR,
      sendVerificationEmail: ({ user, url }) => send(verificationEmail(user.email, url)),
    },

    socialProviders: options.google
      ? {
          google: {
            clientId: options.google.clientId,
            clientSecret: options.google.clientSecret,
            prompt: "select_account",
          },
        }
      : undefined,

    rateLimit: {
      enabled: options.rateLimit ?? true,
      storage: "database",
      modelName: "rate_limits",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: HOUR, max: 5 },
        "/request-password-reset": { window: HOUR, max: 3 },
        "/send-verification-email": { window: HOUR, max: 3 },
        "/reset-password": { window: HOUR, max: 5 },
      },
    },

    advanced: {
      // Explicit: Better Auth skips origin checks when NODE_ENV=test; never skip them here.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      useSecureCookies: options.production,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },

    hooks: {
      // Server-side validation with the same rules as the forms (never trust the browser).
      before: createAuthMiddleware(async (ctx) => {
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        const text = (key: string) => (typeof body[key] === "string" ? (body[key] as string) : "");
        if (ctx.path === "/sign-up/email") {
          const errors = validateRegistration({
            email: text("email"),
            password: text("password"),
            name: text("name"),
          });
          if (Object.keys(errors).length > 0) {
            throw new APIError("BAD_REQUEST", { message: "Invalid input", code: "INVALID_INPUT" });
          }
        }
        if (ctx.path === "/update-user" && normalizeName(text("name")).length > MAX_NAME_LENGTH) {
          throw new APIError("BAD_REQUEST", { message: "Invalid input", code: "INVALID_INPUT" });
        }
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
