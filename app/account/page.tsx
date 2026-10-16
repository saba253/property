import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProfileForm, SignOutButton } from "@/components/auth/account-actions";
import { AuthUnavailable } from "@/components/auth/auth-shell";
import { card, pageContainer } from "@/components/ui/styles";
import { getAuthStatus, getCurrentSession } from "@/lib/auth/instance";

export const metadata: Metadata = {
  title: "ჩემი ანგარიში | Property Intelligence",
  robots: { index: false, follow: false },
};

/*
 * Rendered per request from the session validated in the database (never cached or prerendered:
 * connection() and the session cookie make it dynamic, and nothing here uses "use cache").
 * Visitors without a session are sent to the login page; nothing private is rendered for them.
 */
async function Account() {
  await connection();
  if (!getAuthStatus().enabled) {
    return (
      <div className={`${card} mt-6 p-5`}>
        <AuthUnavailable />
      </div>
    );
  }
  const session = await getCurrentSession();
  if (!session) redirect("/login?next=/account");
  const { user } = session;

  return (
    <div className="mt-6 space-y-5">
      <section aria-labelledby="profile-heading" className={`${card} p-5 sm:p-6`}>
        <h2 id="profile-heading" className="text-lg font-semibold text-navy">
          პროფილი
        </h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted">ელფოსტა</dt>
          <dd className="break-all text-ink">{user.email}</dd>
          <dt className="text-muted">სტატუსი</dt>
          <dd className="text-ink">
            {user.emailVerified ? "ელფოსტა დადასტურებულია" : "ელფოსტა დასადასტურებელია"}
          </dd>
        </dl>
        <div className="mt-5 border-t border-line pt-5">
          <ProfileForm name={user.name} />
        </div>
      </section>

      <section aria-labelledby="listings-heading" className={`${card} p-5 sm:p-6`}>
        <h2 id="listings-heading" className="text-lg font-semibold text-navy">
          ჩემი განცხადებები
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          განცხადებების დამატება და მართვა ანგარიშიდან მომდევნო ეტაპზე გაიხსნება. მანამდე შეგიძლიათ
          სცადოთ{" "}
          <Link href="/properties/new" className="font-semibold text-accent-700 hover:underline">
            დემო განცხადების მომზადება
          </Link>{" "}
          (არ ქვეყნდება).
        </p>
      </section>

      <SignOutButton />
    </div>
  );
}

export default function AccountPage() {
  return (
    <main className={`${pageContainer} flex-1 py-8 sm:py-12`}>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">ჩემი ანგარიში</h1>
        <Suspense fallback={<p className="mt-6 text-sm text-muted">იტვირთება…</p>}>
          <Account />
        </Suspense>
      </div>
    </main>
  );
}
