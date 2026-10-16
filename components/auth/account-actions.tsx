"use client";

import { type FormEvent, useId, useState } from "react";
import { authRequest } from "@/components/auth/auth-request";
import { FormMessage } from "@/components/auth/auth-shell";
import { buttonPrimary, buttonSecondary, fieldInput, fieldLabel } from "@/components/ui/styles";
import { AUTH_MESSAGES, MAX_NAME_LENGTH, normalizeName } from "@/lib/auth/validation";

/** Display name editing (the server checks the session and the length again). */
export function ProfileForm({ name }: { name: string }) {
  const id = useId();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = normalizeName(String(new FormData(event.currentTarget).get("name") ?? ""));
    if (value.length > MAX_NAME_LENGTH) {
      setMessage({ tone: "error", text: AUTH_MESSAGES.nameTooLong });
      return;
    }
    setPending(true);
    const result = await authRequest("/update-user", { name: value });
    setPending(false);
    setMessage(
      result.ok
        ? { tone: "info", text: "სახელი შენახულია." }
        : { tone: "error", text: AUTH_MESSAGES.generic },
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label htmlFor={id} className={fieldLabel}>
          სახელი
        </label>
        <input
          id={id}
          name="name"
          defaultValue={name}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="name"
          className={fieldInput}
        />
      </div>
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      <button type="submit" disabled={pending} className={`${buttonSecondary} disabled:opacity-60`}>
        {pending ? "ინახება…" : "შენახვა"}
      </button>
    </form>
  );
}

/** Signs out on the server (the session row is deleted), then reloads the homepage. */
export function SignOutButton({ className = "" }: { className?: string }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authRequest("/sign-out", {});
        // Favorites and comparison stay in this browser: signing out does not touch them.
        // A full reload, so every server-rendered part drops the signed-in state.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/");
      }}
      className={`${buttonPrimary} disabled:opacity-60 ${className}`}
    >
      {pending ? "გამოსვლა…" : "გამოსვლა"}
    </button>
  );
}
