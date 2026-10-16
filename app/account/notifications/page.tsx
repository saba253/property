import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthUnavailable } from "@/components/auth/auth-shell";
import { NotificationList } from "@/components/notifications/notification-list";
import { card, pageContainer } from "@/components/ui/styles";
import { getAuthStatus } from "@/lib/auth/instance";
import { draftDeps } from "@/lib/drafts/instance";
import { notificationsForUser } from "@/lib/notifications/notification-service";
import { formatWhen } from "@/lib/review/format-time";

export const metadata: Metadata = {
  title: "შეტყობინებები | Property Intelligence",
  robots: { index: false, follow: false },
};

/*
 * The signed-in user's own notifications about moderation decisions, newest first. Per request
 * from the verified session; never cached. Signed-out visitors are sent to the login page.
 */
async function Notifications({
  searchParams,
}: Pick<PageProps<"/account/notifications">, "searchParams">) {
  await connection();
  if (!getAuthStatus().enabled) {
    return (
      <div className={`${card} mt-6 p-5`}>
        <AuthUnavailable />
      </div>
    );
  }
  const raw = (await searchParams).page;
  const result = await notificationsForUser(draftDeps, (Array.isArray(raw) ? raw[0] : raw) ?? 1);
  if (result === null) redirect("/login?next=/account/notifications");
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));

  if (result.total === 0) {
    return (
      <div className="mt-6 rounded-card border border-dashed border-line-strong bg-surface px-6 py-10 text-center text-sm text-muted">
        შეტყობინებები ჯერ არ გაქვთ. აქ გამოჩნდება მოდერატორის გადაწყვეტილებები თქვენს განცხადებებზე.
      </div>
    );
  }

  return (
    <>
      <NotificationList
        items={result.items.map((item) => ({ ...item, createdAtText: formatWhen(item.createdAt) }))}
      />
      {pages > 1 && (
        <nav aria-label="გვერდები" className="mt-6 flex items-center justify-between text-sm">
          {result.page > 1 ? (
            <Link
              href={`/account/notifications?page=${result.page - 1}`}
              className="font-semibold text-accent-700 hover:underline"
            >
              ← წინა
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            გვერდი {result.page} / {pages}
          </span>
          {result.page < pages ? (
            <Link
              href={`/account/notifications?page=${result.page + 1}`}
              className="font-semibold text-accent-700 hover:underline"
            >
              შემდეგი →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}

export default function NotificationsPage({ searchParams }: PageProps<"/account/notifications">) {
  return (
    <main className={`${pageContainer} flex-1 py-8 sm:py-12`}>
      <div className="mx-auto max-w-3xl">
        <Link href="/account" className="text-sm font-medium text-muted hover:text-ink">
          ← ჩემი ანგარიში
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-navy sm:text-3xl">
          შეტყობინებები
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          მოდერატორის გადაწყვეტილებები თქვენს განცხადებებზე. ელფოსტით შეტყობინებები ჯერ არ
          იგზავნება.
        </p>
        <Suspense fallback={<p className="mt-6 text-sm text-muted">იტვირთება…</p>}>
          <Notifications searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
