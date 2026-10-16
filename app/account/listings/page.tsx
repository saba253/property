import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArchiveDraftButton } from "@/components/auth/archive-draft-button";
import { ListingReviewControls } from "@/components/review/listing-review-controls";
import { StatusBadge } from "@/components/review/status-badge";
import { AuthUnavailable } from "@/components/auth/auth-shell";
import { buttonPrimary, card, pageContainer } from "@/components/ui/styles";
import { getAuthStatus } from "@/lib/auth/instance";
import { listDraftsForUser } from "@/lib/drafts/draft-service";
import { draftDeps } from "@/lib/drafts/instance";
import { photoUrl } from "@/lib/photos/photo-types";
import { formatMoney } from "@/lib/pricing/format-money";
import { PROPERTY_TYPES, TRANSACTION_TYPES } from "@/lib/properties/listing-types";
import { EDITABLE_STATUSES, STATUS_TEXT } from "@/lib/review/statuses";

export const metadata: Metadata = {
  title: "ჩემი განცხადებები | Property Intelligence",
  robots: { index: false, follow: false },
};

/** Date of the last save as recorded by the database (day.month.year, Tbilisi time). */
function savedOn(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Tbilisi",
  }).format(new Date(iso));
  return parts.replace(/\//g, ".");
}

// Per request, from the verified session; never cached or prerendered.
async function Drafts() {
  await connection();
  if (!getAuthStatus().enabled) {
    return (
      <div className={`${card} mt-6 p-5`}>
        <AuthUnavailable />
      </div>
    );
  }
  const drafts = await listDraftsForUser(draftDeps);
  if (drafts === null) redirect("/login?next=/account/listings");

  if (drafts.length === 0) {
    return (
      <div className="mt-6 rounded-card border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
        <p className="text-base font-semibold text-navy">ჯერ განცხადება არ გაქვთ.</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
          შეავსეთ განცხადების ფორმა და ბოლო ნაბიჯზე შეინახეთ დრაფტად. დრაფტი პირადია და არ
          ქვეყნდება.
        </p>
        <Link href="/properties/new" className={`${buttonPrimary} mt-5`}>
          ახალი დრაფტი
        </Link>
      </div>
    );
  }

  return (
    <ul className="mt-6 space-y-3">
      {drafts.map((draft) => (
        <li key={draft.id} className={`${card} p-4 sm:p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 gap-4">
              <div className="h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-cream ring-1 ring-line sm:h-20 sm:w-28">
                {draft.coverPhotoId ? (
                  // Owner-only photo route (private, not cached).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUrl(draft.id, draft.coverPhotoId)}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full items-center justify-center text-[11px] text-subtle">
                    ფოტო არ არის
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
                  <StatusBadge status={draft.status} />
                  <span>
                    {TRANSACTION_TYPES[draft.transactionType].label} ·{" "}
                    {PROPERTY_TYPES[draft.propertyType].label}
                  </span>
                </p>
                <h2 className="mt-1.5 text-base font-semibold break-words text-navy">
                  {draft.title}
                </h2>
                <p className="mt-0.5 text-sm text-muted">
                  {draft.city}, {draft.district} · {formatMoney(draft.amount, draft.currency)}
                  {draft.transactionType === "rent" ? " / თვე" : ""} ({draft.currency})
                </p>
                <p className="mt-0.5 text-xs text-subtle">
                  ბოლოს შენახულია: {savedOn(draft.updatedAt)}
                  {draft.photoCount > 0 && ` · ${draft.photoCount} ფოტო`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {EDITABLE_STATUSES.includes(draft.status) ? (
                <Link
                  href={`/account/listings/edit?draft=${encodeURIComponent(draft.id)}`}
                  className="text-sm font-semibold text-accent-700 hover:underline"
                >
                  {draft.status === "changes_requested" ? "შესწორება" : "გაგრძელება"}
                </Link>
              ) : (
                <Link
                  href={`/account/listings/view?listing=${encodeURIComponent(draft.id)}`}
                  className="text-sm font-semibold text-accent-700 hover:underline"
                >
                  ნახვა
                </Link>
              )}
              {draft.status !== "submitted" && (
                <ArchiveDraftButton draftId={draft.id} title={draft.title} />
              )}
            </div>
          </div>
          <div className="mt-3 space-y-2 border-t border-line pt-3">
            <p className="text-sm text-muted">{STATUS_TEXT[draft.status].note}</p>
            {draft.reason && (
              <p className="rounded-xl bg-cream px-3 py-2 text-sm text-navy ring-1 ring-line">
                <span className="font-semibold">მოდერატორის კომენტარი:</span> {draft.reason}
              </p>
            )}
            <ListingReviewControls
              listingId={draft.id}
              status={draft.status}
              photoCount={draft.photoCount}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function MyListingsPage() {
  return (
    <main className={`${pageContainer} flex-1 py-8 sm:py-12`}>
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">
            ჩემი განცხადებები
          </h1>
          <Link
            href="/properties/new"
            className="text-sm font-semibold text-accent-700 hover:underline"
          >
            + ახალი დრაფტი
          </Link>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted">
          განცხადებები და მათი ფოტოები პირადია: მათ მხოლოდ თქვენ ხედავთ (განხილვისას — მოდერატორიც),
          ძიებაში და რუკაზე არ ჩანს. დამტკიცებულიც კი ჯერ არ ქვეყნდება: გამოქვეყნება მომდევნო ეტაპზე
          დაემატება.
        </p>
        <Suspense fallback={<p className="mt-6 text-sm text-muted">იტვირთება…</p>}>
          <Drafts />
        </Suspense>
      </div>
    </main>
  );
}
