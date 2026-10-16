"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { authRequest } from "@/components/auth/auth-request";
import { useAccountStatus } from "@/components/auth/use-account-status";

/*
 * Account entry in the header menu. The server (and the first render) always show "შესვლა",
 * so static pages stay static and markup matches during hydration. After hydration a small
 * request (/api/account/status, own session only, no-store) tells whether accounts are on and
 * whether this visitor is signed in; then "ჩემი ანგარიში" and "გამოსვლა" replace it. Nothing about
 * the session is stored in the browser beyond Better Auth's HttpOnly cookie.
 */

function PersonIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5 fill-current">
      <path d="M10 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 8c3.9 0 7 2 7 4.5V18a1 1 0 1 1-2 0v-1.5c0-1.1-2-2.5-5-2.5s-5 1.4-5 2.5V18a1 1 0 1 1-2 0v-1.5C3 14 6.1 12 10 12Z" />
    </svg>
  );
}

const item =
  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-cream";

/** Account entry at the top of the header menu (the header itself has no room left). */
export function HeaderAccount() {
  const status = useAccountStatus();
  const pathname = usePathname();

  if (!status?.signedIn) {
    const loginHref =
      pathname && !["/", "/login", "/register"].includes(pathname)
        ? `/login?next=${encodeURIComponent(pathname)}`
        : "/login";
    return (
      <Link href={loginHref} className={item}>
        <PersonIcon />
        <span>
          <span className="block text-sm font-semibold text-navy">შესვლა</span>
          <span className="mt-0.5 block text-xs text-muted">
            {status && !status.enabled ? "ანგარიშები ჯერ არ არის ჩართული" : "ანგარიში და პროფილი"}
          </span>
        </span>
      </Link>
    );
  }

  return (
    <div>
      <Link href="/account" className={item}>
        <PersonIcon />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-navy">ჩემი ანგარიში</span>
          {status.name && (
            <span className="mt-0.5 block truncate text-xs text-muted">{status.name}</span>
          )}
        </span>
      </Link>
      <button
        type="button"
        onClick={async () => {
          await authRequest("/sign-out", {});
          // A full reload, so every server-rendered part drops the signed-in state.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign("/");
        }}
        className={`${item} text-sm font-semibold text-navy`}
      >
        <span aria-hidden="true" className="inline-block w-5 text-center">
          ↩
        </span>
        გამოსვლა
      </button>
    </div>
  );
}
