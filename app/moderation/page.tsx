import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ClaimBadge, SubmissionBadge } from "@/components/review/claim-badge";
import {
  buttonSecondary,
  card,
  fieldInput,
  fieldLabel,
  pageContainer,
} from "@/components/ui/styles";
import { getAuthStatus } from "@/lib/auth/instance";
import { draftDeps } from "@/lib/drafts/instance";
import { formatMoney } from "@/lib/pricing/format-money";
import { knownCities } from "@/lib/properties/cities";
import {
  PROPERTY_TYPES,
  PROPERTY_TYPE_ORDER,
  TRANSACTION_TYPES,
} from "@/lib/properties/listing-types";
import type { PropertyType, TransactionType } from "@/lib/properties/types";
import { formatWhen } from "@/lib/review/format-time";
import { queueQuery } from "@/lib/review/queue-query";
import { adminOwnSubmitted, cleanQueueFilters, moderationQueue } from "@/lib/review/review-service";
import { CLAIM_MINUTES } from "@/lib/review/statuses";

export const metadata: Metadata = {
  title: "მოდერაცია | Property Intelligence",
  robots: { index: false, follow: false },
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/*
 * Review queue (oldest submission first) for moderators only, with city and property-type
 * filters, assignment state and first/resubmission labels. Everyone else, signed in or not,
 * gets the ordinary 404: the page does not reveal that it exists. Per request, never cached.
 * Owners' names and emails, and which moderator holds a claim, are not shown.
 */
async function Queue({ searchParams }: Pick<PageProps<"/moderation">, "searchParams">) {
  await connection();
  if (!getAuthStatus().enabled) notFound();
  const params = await searchParams;
  const filters = cleanQueueFilters({ city: first(params.city), type: first(params.type) });
  const queue = await moderationQueue(draftDeps, Number(first(params.page) ?? "1"), filters);
  if (!queue) notFound();
  const pages = Math.max(1, Math.ceil(queue.total / queue.pageSize));
  const filtered = Boolean(filters.city || filters.propertyType);
  const own = await adminOwnSubmitted(draftDeps);

  return (
    <>
      {own && (
        <p className="mt-4 rounded-xl bg-cream px-3 py-2 text-sm text-navy ring-1 ring-line">
          ადმინისტრატორი: ცალკე აღება საჭირო არ არის — განცხადება გადაწყვეტილებისას მოგენიჭებათ
          (სხვა მოდერატორის აქტიურ აღებას სისტემა არ გადაფარავს).
        </p>
      )}
      {own && own.length > 0 && (
        <section
          aria-labelledby="own-heading"
          className="mt-6 rounded-card border border-sand-200 bg-cream p-4"
        >
          <h2 id="own-heading" className="text-sm font-semibold text-navy">
            თქვენი განცხადებები განხილვაზე (ადმინისტრატორის თვითდამტკიცება)
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {own.map((item) => (
              <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="min-w-0 break-words text-navy">{item.title}</span>
                <Link
                  href={`/account/listings/view?listing=${encodeURIComponent(item.id)}`}
                  className="inline-flex min-h-10 items-center font-semibold text-accent-700 hover:underline"
                >
                  {item.claimedByOther ? "მოდერატორი განიხილავს" : "გახსნა →"}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <form
        method="get"
        action="/moderation"
        className={`${card} mt-6 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end`}
      >
        <label className={fieldLabel}>
          ქალაქი
          <select name="city" defaultValue={filters.city ?? ""} className={fieldInput}>
            <option value="">ყველა</option>
            {knownCities.map((city) => (
              <option key={city.slug} value={city.slug}>
                {city.name}
              </option>
            ))}
          </select>
        </label>
        <label className={fieldLabel}>
          ქონების ტიპი
          <select name="type" defaultValue={filters.propertyType ?? ""} className={fieldInput}>
            <option value="">ყველა</option>
            {PROPERTY_TYPE_ORDER.map((type) => (
              <option key={type} value={type}>
                {PROPERTY_TYPES[type].label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="submit" className={`${buttonSecondary} h-11 px-5 text-sm`}>
            გაფილტვრა
          </button>
          {filtered && (
            <Link
              href="/moderation"
              className="inline-flex h-11 items-center px-2 text-sm font-medium text-muted hover:text-ink"
            >
              გასუფთავება
            </Link>
          )}
        </div>
      </form>

      <p className="mt-4 text-sm text-muted" aria-live="polite">
        განხილვას ელოდება{filtered ? " (ფილტრით)" : ""}: {queue.total}
      </p>
      {queue.entries.length === 0 ? (
        <div className="mt-4 rounded-card border border-dashed border-line-strong bg-surface px-6 py-10 text-center text-sm text-muted">
          {queue.total === 0 ? "რიგი ცარიელია." : "ამ გვერდზე ჩანაწერი არ არის."}
        </div>
      ) : (
        <ol className="mt-4 space-y-3" start={(queue.page - 1) * queue.pageSize + 1}>
          {queue.entries.map((entry) => (
            <li key={entry.id} className={`${card} p-4 sm:p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-1.5">
                    <ClaimBadge claim={entry.claim} />
                    <SubmissionBadge number={entry.submissionNumber} />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-muted">
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
                    გაგზავნილია: {formatWhen(entry.submittedAt)}
                  </p>
                </div>
                <Link
                  href={`/moderation/review${queueQuery(filters, { listing: entry.id })}`}
                  className="inline-flex min-h-10 items-center text-sm font-semibold text-accent-700 hover:underline"
                >
                  {entry.claim.state === "other" ? "ნახვა →" : "განხილვა →"}
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
              href={`/moderation${queueQuery(filters, { page: String(queue.page - 1) })}`}
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
              href={`/moderation${queueQuery(filters, { page: String(queue.page + 1) })}`}
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
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">მოდერაცია</h1>
          <Link
            href="/moderation/history"
            className="text-sm font-semibold text-accent-700 hover:underline"
          >
            განხილვების ისტორია →
          </Link>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted">
          განსახილველი განცხადებები, ძველი პირველი. გადაწყვეტილებისთვის ჯერ აიღეთ განცხადება
          განსახილველად ({CLAIM_MINUTES} წუთით). დამტკიცებული განცხადება ჯერ არ ქვეყნდება. საკუთარ
          განცხადებას ვერ განიხილავთ.
        </p>
        <Suspense fallback={<p className="mt-6 text-sm text-muted">იტვირთება…</p>}>
          <Queue searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
