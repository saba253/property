import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { card, pageContainer } from "@/components/ui/styles";
import { getAuthStatus } from "@/lib/auth/instance";
import { draftDeps } from "@/lib/drafts/instance";
import { formatMoney } from "@/lib/pricing/format-money";
import { PROPERTY_TYPES, TRANSACTION_TYPES } from "@/lib/properties/listing-types";
import type { PropertyType, TransactionType } from "@/lib/properties/types";
import { moderationQueue } from "@/lib/review/review-service";

export const metadata: Metadata = {
  title: "მოდერაცია | Property Intelligence",
  robots: { index: false, follow: false },
};

function submittedOn(iso: string): string {
  return new Intl.DateTimeFormat("ka-GE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tbilisi",
  }).format(new Date(iso));
}

/*
 * Review queue (oldest submission first) for moderators only. Everyone else, signed in or not,
 * gets the ordinary 404: the page does not reveal that it exists. Per request, never cached.
 * Owners' names and emails are not shown.
 */
async function Queue({ searchParams }: Pick<PageProps<"/moderation">, "searchParams">) {
  await connection();
  if (!getAuthStatus().enabled) notFound();
  const raw = (await searchParams).page;
  const page = Number((Array.isArray(raw) ? raw[0] : raw) ?? "1");
  const queue = await moderationQueue(draftDeps, page);
  if (!queue) notFound();
  const pages = Math.max(1, Math.ceil(queue.total / queue.pageSize));

  return (
    <>
      <p className="mt-2 text-sm text-muted" aria-live="polite">
        განხილვას ელოდება: {queue.total}
      </p>
      {queue.entries.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-line-strong bg-surface px-6 py-10 text-center text-sm text-muted">
          {queue.total === 0 ? "რიგი ცარიელია." : "ამ გვერდზე ჩანაწერი არ არის."}
        </div>
      ) : (
        <ol className="mt-6 space-y-3" start={(queue.page - 1) * queue.pageSize + 1}>
          {queue.entries.map((entry) => (
            <li key={entry.id} className={`${card} p-4 sm:p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted">
                    {TRANSACTION_TYPES[entry.transactionType as TransactionType].label} ·{" "}
                    {PROPERTY_TYPES[entry.propertyType as PropertyType].label} · {entry.photoCount}{" "}
                    ფოტო
                  </p>
                  <h2 className="mt-1 text-base font-semibold break-words text-navy">
                    {entry.title}
                  </h2>
                  <p className="mt-0.5 text-sm text-muted">
                    {entry.city}, {entry.district} ·{" "}
                    {formatMoney(entry.amount, entry.currency as "USD" | "GEL")}
                    {entry.transactionType === "rent" ? " / თვე" : ""} ({entry.currency})
                  </p>
                  <p className="mt-0.5 text-xs text-subtle">
                    გაგზავნილია: {submittedOn(entry.submittedAt)}
                  </p>
                </div>
                <Link
                  href={`/moderation/review?listing=${encodeURIComponent(entry.id)}`}
                  className="text-sm font-semibold text-accent-700 hover:underline"
                >
                  განხილვა →
                </Link>
              </div>
            </li>
          ))}
        </ol>
      )}
      {pages > 1 && (
        <nav aria-label="გვერდები" className="mt-6 flex items-center justify-between text-sm">
          {queue.page > 1 ? (
            <Link
              href={`/moderation?page=${queue.page - 1}`}
              className="font-semibold text-accent-700 hover:underline"
            >
              ← წინა
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            გვერდი {queue.page} / {pages}
          </span>
          {queue.page < pages ? (
            <Link
              href={`/moderation?page=${queue.page + 1}`}
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

export default function ModerationPage({ searchParams }: PageProps<"/moderation">) {
  return (
    <main className={`${pageContainer} flex-1 py-8 sm:py-12`}>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">მოდერაცია</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          განსახილველი განცხადებები, ძველი პირველი. დამტკიცებული განცხადება ჯერ არ ქვეყნდება.
          საკუთარ განცხადებას ვერ განიხილავთ.
        </p>
        <Suspense fallback={<p className="mt-6 text-sm text-muted">იტვირთება…</p>}>
          <Queue searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
