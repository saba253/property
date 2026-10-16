/*
 * Validation of account form input. Runs in the browser for quick feedback AND on the server
 * (Better Auth "before" hook in lib/auth/server.ts), so it never depends on client checks.
 * Messages are Georgian and never reveal whether an account exists.
 */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_NAME_LENGTH = 60;
export const MAX_EMAIL_LENGTH = 254;

/** Trimmed, Unicode-normalized, lower-case email (Better Auth stores emails lower-case). */
export function normalizeEmail(value: string): string {
  return value.normalize("NFC").trim().toLowerCase();
}

/** A pragmatic address check: one @, a dotted domain, no spaces, at most 254 characters. */
export function isValidEmail(value: string): boolean {
  const email = normalizeEmail(value);
  return (
    email.length >= 3 &&
    email.length <= MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)
  );
}

export function normalizeName(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

export type FieldErrors = Partial<
  Record<"email" | "password" | "passwordConfirm" | "name", string>
>;

export const AUTH_MESSAGES = {
  invalidEmail: "შეიყვანეთ სწორი ელფოსტის მისამართი.",
  passwordTooShort: `პაროლი უნდა შეიცავდეს მინიმუმ ${MIN_PASSWORD_LENGTH} სიმბოლოს.`,
  passwordTooLong: `პაროლი არ უნდა აღემატებოდეს ${MAX_PASSWORD_LENGTH} სიმბოლოს.`,
  passwordMismatch: "პაროლები არ ემთხვევა.",
  nameTooLong: `სახელი არ უნდა აღემატებოდეს ${MAX_NAME_LENGTH} სიმბოლოს.`,
  invalidCredentials: "ელფოსტა ან პაროლი არასწორია.",
  emailNotVerified:
    "ჯერ დაადასტურეთ ელფოსტა. დადასტურების ბმული ხელახლა გამოგეგზავნათ, თუ ანგარიში არსებობს.",
  tooManyRequests: "ძალიან ბევრი მცდელობა. სცადეთ რამდენიმე წუთში.",
  generic: "მოთხოვნა ვერ შესრულდა. სცადეთ თავიდან.",
} as const;

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return AUTH_MESSAGES.passwordTooShort;
  if (password.length > MAX_PASSWORD_LENGTH) return AUTH_MESSAGES.passwordTooLong;
  return null;
}

export function validateRegistration(input: {
  email: string;
  password: string;
  passwordConfirm?: string;
  name?: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!isValidEmail(input.email)) errors.email = AUTH_MESSAGES.invalidEmail;
  const password = validatePassword(input.password);
  if (password) errors.password = password;
  if (input.passwordConfirm !== undefined && input.passwordConfirm !== input.password) {
    errors.passwordConfirm = AUTH_MESSAGES.passwordMismatch;
  }
  if (normalizeName(input.name ?? "").length > MAX_NAME_LENGTH)
    errors.name = AUTH_MESSAGES.nameTooLong;
  return errors;
}
