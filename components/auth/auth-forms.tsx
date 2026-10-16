"use client";

import Link from "next/link";
import { type FormEvent, useId, useState } from "react";
import { authRequest } from "@/components/auth/auth-request";
import { FormMessage } from "@/components/auth/auth-shell";
import { buttonPrimary, buttonSecondary, fieldInput, fieldLabel } from "@/components/ui/styles";
import {
  AUTH_MESSAGES,
  type FieldErrors,
  MAX_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  isValidEmail,
  normalizeEmail,
  normalizeName,
  validatePassword,
  validateRegistration,
} from "@/lib/auth/validation";

/*
 * Account forms. They call Better Auth's endpoints with fetch (rate limits and origin checks
 * apply on the server, which also validates everything again). Passwords stay in the form
 * fields only: they are never stored, logged or put in a URL.
 */

function Field({
  name,
  label,
  type,
  autoComplete,
  error,
  hint,
  required = true,
  maxLength,
}: {
  name: string;
  label: string;
  type: string;
  autoComplete: string;
  error?: string;
  hint?: string;
  required?: boolean;
  maxLength?: number;
}) {
  const id = useId();
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div>
      <label htmlFor={id} className={fieldLabel}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={fieldInput}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-amber-900">
          {error}
        </p>
      )}
    </div>
  );
}

const read = (form: HTMLFormElement, name: string) => String(new FormData(form).get(name) ?? "");

function errorMessage(status: number, code: string | null): string {
  if (status === 429) return AUTH_MESSAGES.tooManyRequests;
  if (code === "EMAIL_NOT_VERIFIED" || status === 403) return AUTH_MESSAGES.emailNotVerified;
  if (status === 401) return AUTH_MESSAGES.invalidCredentials;
  return AUTH_MESSAGES.generic;
}

export function LoginForm({ next, google }: { next: string; google: boolean }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = normalizeEmail(read(form, "email"));
    const password = read(form, "password");
    if (!isValidEmail(email) || !password) {
      setMessage(AUTH_MESSAGES.invalidCredentials);
      return;
    }
    setPending(true);
    setMessage(null);
    const result = await authRequest("/sign-in/email", { email, password });
    if (result.ok) {
      // A full navigation, so the server renders the page with the new session cookie.
      window.location.assign(next);
      return;
    }
    setPending(false);
    setMessage(errorMessage(result.status, result.code));
  }

  async function onGoogle() {
    setPending(true);
    const result = await authRequest("/sign-in/social", { provider: "google", callbackURL: next });
    const url =
      result.data && typeof result.data === "object" && "url" in result.data
        ? String(result.data.url)
        : null;
    if (result.ok && url) {
      window.location.assign(url);
      return;
    }
    setPending(false);
    setMessage(AUTH_MESSAGES.generic);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {message && <FormMessage tone="error">{message}</FormMessage>}
      <Field name="email" label="ელფოსტა" type="email" autoComplete="email" />
      <Field name="password" label="პაროლი" type="password" autoComplete="current-password" />
      <div className="flex justify-end">
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-accent-700 hover:underline"
        >
          პაროლი დაგავიწყდათ?
        </Link>
      </div>
      <button
        type="submit"
        disabled={pending}
        className={`${buttonPrimary} w-full disabled:opacity-60`}
      >
        {pending ? "მიმდინარეობს…" : "შესვლა"}
      </button>
      {google && (
        <button
          type="button"
          onClick={onGoogle}
          disabled={pending}
          className={`${buttonSecondary} w-full disabled:opacity-60`}
        >
          Google-ით შესვლა
        </button>
      )}
      <p className="text-center text-sm text-muted">
        ანგარიში არ გაქვთ?{" "}
        <Link
          href={`/register${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-semibold text-accent-700 hover:underline"
        >
          რეგისტრაცია
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = {
      email: normalizeEmail(read(form, "email")),
      password: read(form, "password"),
      passwordConfirm: read(form, "passwordConfirm"),
      name: normalizeName(read(form, "name")),
    };
    const found = validateRegistration(input);
    setErrors(found);
    setMessage(null);
    if (Object.keys(found).length > 0) return;
    setPending(true);
    const result = await authRequest("/sign-up/email", {
      email: input.email,
      password: input.password,
      name: input.name,
      callbackURL: "/login?verified=1",
    });
    setPending(false);
    // The same answer for new and existing emails (no account enumeration).
    if (result.ok) setDone(true);
    else setMessage(result.status === 429 ? AUTH_MESSAGES.tooManyRequests : AUTH_MESSAGES.generic);
  }

  if (done) {
    return (
      <FormMessage tone="info">
        თუ ეს ელფოსტა სწორია, მასზე გამოიგზავნა დადასტურების ბმული. დაადასტურეთ ელფოსტა და შემდეგ
        შედით ანგარიშში.
      </FormMessage>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {message && <FormMessage tone="error">{message}</FormMessage>}
      <Field
        name="name"
        label="სახელი (არასავალდებულო)"
        type="text"
        autoComplete="name"
        required={false}
        maxLength={MAX_NAME_LENGTH}
        error={errors.name}
      />
      <Field name="email" label="ელფოსტა" type="email" autoComplete="email" error={errors.email} />
      <Field
        name="password"
        label="პაროლი"
        type="password"
        autoComplete="new-password"
        maxLength={MAX_PASSWORD_LENGTH}
        hint={`მინიმუმ ${MIN_PASSWORD_LENGTH} სიმბოლო.`}
        error={errors.password}
      />
      <Field
        name="passwordConfirm"
        label="გაიმეორეთ პაროლი"
        type="password"
        autoComplete="new-password"
        error={errors.passwordConfirm}
      />
      <button
        type="submit"
        disabled={pending}
        className={`${buttonPrimary} w-full disabled:opacity-60`}
      >
        {pending ? "მიმდინარეობს…" : "რეგისტრაცია"}
      </button>
      <p className="text-center text-sm text-muted">
        უკვე გაქვთ ანგარიში?{" "}
        <Link href="/login" className="font-semibold text-accent-700 hover:underline">
          შესვლა
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = normalizeEmail(read(event.currentTarget, "email"));
    if (!isValidEmail(email)) {
      setError(AUTH_MESSAGES.invalidEmail);
      return;
    }
    setPending(true);
    setError(null);
    const result = await authRequest("/request-password-reset", {
      email,
      redirectTo: "/reset-password",
    });
    setPending(false);
    if (result.status === 429) setError(AUTH_MESSAGES.tooManyRequests);
    else if (!result.ok) setError(AUTH_MESSAGES.generic);
    else setDone(true);
  }

  if (done) {
    return (
      <FormMessage tone="info">
        თუ ამ ელფოსტით ანგარიში არსებობს, მასზე გამოიგზავნა პაროლის აღდგენის ბმული. ბმული მოქმედებს
        1 საათის განმავლობაში.
      </FormMessage>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <Field name="email" label="ელფოსტა" type="email" autoComplete="email" />
      <button
        type="submit"
        disabled={pending}
        className={`${buttonPrimary} w-full disabled:opacity-60`}
      >
        {pending ? "მიმდინარეობს…" : "ბმულის გაგზავნა"}
      </button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <FormMessage tone="error">
        აღდგენის ბმული არასწორია ან ვადაგასულია.{" "}
        <Link href="/forgot-password" className="font-semibold underline">
          მოითხოვეთ ახალი ბმული
        </Link>
        .
      </FormMessage>
    );
  }

  if (done) {
    return (
      <FormMessage tone="info">
        პაროლი შეიცვალა და სხვა მოწყობილობებზე გახსნილი სესიები დაიხურა.{" "}
        <Link href="/login" className="font-semibold underline">
          შესვლა
        </Link>
      </FormMessage>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = read(form, "password");
    const found: FieldErrors = {};
    const problem = validatePassword(password);
    if (problem) found.password = problem;
    if (read(form, "passwordConfirm") !== password)
      found.passwordConfirm = AUTH_MESSAGES.passwordMismatch;
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setPending(true);
    const result = await authRequest("/reset-password", { token, newPassword: password });
    setPending(false);
    if (result.ok) setDone(true);
    else if (result.status === 429) setMessage(AUTH_MESSAGES.tooManyRequests);
    else setMessage("აღდგენის ბმული არასწორია ან ვადაგასულია. მოითხოვეთ ახალი ბმული.");
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {message && <FormMessage tone="error">{message}</FormMessage>}
      <Field
        name="password"
        label="ახალი პაროლი"
        type="password"
        autoComplete="new-password"
        maxLength={MAX_PASSWORD_LENGTH}
        hint={`მინიმუმ ${MIN_PASSWORD_LENGTH} სიმბოლო.`}
        error={errors.password}
      />
      <Field
        name="passwordConfirm"
        label="გაიმეორეთ ახალი პაროლი"
        type="password"
        autoComplete="new-password"
        error={errors.passwordConfirm}
      />
      <button
        type="submit"
        disabled={pending}
        className={`${buttonPrimary} w-full disabled:opacity-60`}
      >
        {pending ? "მიმდინარეობს…" : "პაროლის შეცვლა"}
      </button>
    </form>
  );
}
