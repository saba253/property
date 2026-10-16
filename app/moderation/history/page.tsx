import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { eventLabel } from "@/components/review/status-history";
import {
  buttonSecondary,
  card,
  fieldInput,
  fieldLabel,
  pageContainer,
} from "@/components/ui/styles";
import { getAuthStatus } from "@/lib/auth/instance";
import { draftDeps } from "@/lib/drafts/instance";
import { formatWhen } from "@/lib/review/format-time";
import type { HistoryFilter } from "@/lib/review/review-store";
import { reviewHistory } from "@/lib/review/review-service";
import { STATUS_TEXT } from "@/lib/review/statuses";

export const metadata: Metadata = {
  title: "განხილვების ისტორია | Property Intelligence",
  robots: { index: false, follow: false },
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const FILTER_LABELS: Record<HistoryFilter, string> = {
  approved: STATUS_TEXT.approved.label,
  changes_requested: STATUS_TEXT.changes_requested.label,
  rejected: STATUS_TEXT.rejected.label,
  submitted: "გაგზავნა განსახილველად",
  draft: "გაგზავნის გაუქმება",
  archived: STATUS_TEXT.archived.label,
  assignments: "აღება / გათავისუფლება",
};

/*
 * Review history across user listings, newest first, for moderators only (role checked on the
 * server on every request; everyone else gets the ordinary 404). Minimal personal data: actors
 * appear only as "თქვენ", "მოდერატორი" or "მფლობელი", never by name or email.
 */
async function History({ searchParams }: Pick<PageProps<"/moderation/history">, "searchParams">) {
  await connection();
  if (!getAuthStatus().enabled) notFound();
  const params = await searchParams;
  const history = await reviewHistory(draftDeps, {
    page: first(params.page) ?? 1,
    filter: first(params.filter),
    from: first(params.from),
    to: first(params.to),
  });
  if (!history) notFound();
  const pages = Math.max(1, Math.ceil(history.total / history.pageSize));
  const query = (page: number) => {
    const search = new URLSearchParams({ page: String(page) });
    if (history.filter) search.set("filter", history.filter);
    if (history.from) search.set("from", history.from);
    if (history.to) search.set("to", history.to);
    return `/moderation/history?${search}`;
  };
  const filtered = Boolean(history.filter || history.from || history.to);

  return (
    <>
      <form
        method="get"
        action="/moderation/history"
        className={`${card} mt-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-end`}
      >
        <label className={fieldLabel}>
          მოქმედება
          <select name="filter" defaultValue={history.filter ?? ""} className={fieldInput}>
            <option value="">ყველა</option>
            {(Object.keys(FILTER_LABELS) as HistoryFilter[]).map((key) => (
              <option key={key} value={key}>
                {FILTER_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        <label className={fieldLabel}>
          დან
          <input type="date" name="from" defaultValue={history.from ?? ""} className={fieldInput} />
        </label>
        <label className={fieldLabel}>
          მდე
          <input type="date" name="to" defaultValue={history.to ?? ""} className={fieldInput} />
        </label>
        <div className="flex gap-2">
          <button type="submit" className={`${buttonSecondary} h-11 px-5 text-sm`}>
            გაფილტვრა
          </button>
          {filtered && (
            <Link
              href="/moderation/history"
              className="inline-flex h-11 items-center px-2 text-sm font-medium text-muted hover:text-ink"
            >
              გასუფთავება
            </Link>
          )}
        </div>
      </form>

      <p className="mt-4 text-sm text-muted" aria-live="polite">
        ჩანაწერები: {history.total}
      </p>
      {history.entries.length === 0 ? (
        <div className="mt-4 rounded-card border border-dashed border-line-strong bg-surface px-6 py-10 text-center text-sm text-muted">
          ჩანაწერი არ მოიძებნა.
        </div>
      ) : (
        <ol className="mt-4 space-y-2">
          {history.entries.map((entry, index) => (
            <li key={`${entry.at}-${index}`} className={`${card} p-3 sm:p-4`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-sm text-navy">
                  <span className="font-semibold">{eventLabel(entry)}</span>
                  {entry.kind === "status" && (
                    <span className="text-subtle"> (წინა: {STATUS_TEXT[entry.from].label})</span>
                  )}
                </p>
                <p className="text-xs text-subtle">
                  {entry.actorRole === "admin"
                    ? `${entry.byMe ? "თქვენ" : "ადმინისტრატორი"} · თვითდამტკიცება`
                    : entry.byMe
                      ? "თქვენ"
                      : entry.actorRole === "moderator"
                        ? "მოდერატორი"
                        : "მფლობელი"}{" "}
                  · {formatWhen(entry.at)}
                </p>
              </div>
              <p className="mt-1 text-sm break-words text-muted">
                {entry.reviewable ? (
                  <Link
                    href={`/moderation/review?listing=${encodeURIComponent(entry.listingId)}`}
                    className="font-medium text-accent-700 hover:underline"
                  >
                    {entry.title}
                  </Link>
                ) : (
                  entry.title
                )}
              </p>
              {entry.reason && (
                <p className="mt-1 text-sm whitespace-pre-line text-muted">{entry.reason}</p>
              )}
            </li>
          ))}
        </ol>
      )}
      {pages > 1 && (
        <nav aria-label="გვერდები" className="mt-6 flex items-center justify-between text-sm">
          {history.page > 1 ? (
            <Link
              href={query(history.page - 1)}
              className="font-semibold text-accent-700 hover:underline"
            >
              ← წინა
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            გვერდი {history.page} / {pages}
          </span>
          {history.page < pages ? (
            <Link
              href={query(history.page + 1)}
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

export default function ModerationHistoryPage({ searchParams }: PageProps<"/moderation/history">) {
  return (
    <main className={`${pageContainer} flex-1 py-8 sm:py-12`}>
      <div className="mx-auto max-w-3xl">
        <Link href="/moderation" className="text-sm font-medium text-muted hover:text-ink">
          ← რიგი
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-navy sm:text-3xl">
          განხილვების ისტორია
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          ყველა სტატუსის ცვლილება, აღება და გათავისუფლება, ახალი პირველი. თარიღები თბილისის დროით.
        </p>
        <Suspense fallback={<p className="mt-6 text-sm text-muted">იტვირთება…</p>}>
          <History searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
