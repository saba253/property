import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DraftPreview } from "@/components/listing-draft/draft-preview";
import { ChangeSummary } from "@/components/review/change-summary";
import { ClaimBadge, SubmissionBadge } from "@/components/review/claim-badge";
import { MobileDecisionBar, ReviewPanel } from "@/components/review/review-panel";
import { StatusHistory } from "@/components/review/status-history";
import { card, pageContainer } from "@/components/ui/styles";
import { getAuthStatus } from "@/lib/auth/instance";
import { getExchangeRateState } from "@/lib/currency/get-exchange-rate";
import { draftDeps } from "@/lib/drafts/instance";
import { storedAsDraftPhotos } from "@/lib/photos/photo-types";
import { queueQuery } from "@/lib/review/queue-query";
import { cleanQueueFilters, reviewDetails } from "@/lib/review/review-service";

export const metadata: Metadata = {
  title: "განხილვა | Property Intelligence",
  robots: { index: false, follow: false },
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/*
 * One submitted listing, read-only, for a moderator who does not own it: assignment state,
 * changes since the previous submission, details, private photos (served to moderators only
 * while submitted) and the history including claims; then claiming and the decision. Everyone
 * else, and listings that are not submitted, get the ordinary 404.
 */
async function Review({ searchParams }: Pick<PageProps<"/moderation/review">, "searchParams">) {
  await connection();
  if (!getAuthStatus().enabled) notFound();
  const params = await searchParams;
  const id = first(params.listing) ?? "";
  const filters = cleanQueueFilters({ city: first(params.city), type: first(params.type) });
  const details = await reviewDetails(draftDeps, id, filters);
  if (!details) notFound();
  const rateState = await getExchangeRateState();
  const { meta } = details;
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1.5">
        <ClaimBadge claim={meta.claim} />
        <SubmissionBadge number={meta.submissionNumber} />
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <ChangeSummary changes={meta.changes} />
          <DraftPreview
            item={details.item}
            photos={storedAsDraftPhotos(details.photos)}
            rateState={rateState}
            storedPhotos
            status="submitted"
          />
          <StatusHistory events={details.history} viewer="moderator" />
        </div>
        <aside
          id="review-panel"
          className={`${card} h-fit scroll-mt-20 p-4 sm:p-5 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:overscroll-contain`}
        >
          <p className="mb-3 text-sm text-muted">ფოტოები: {details.photos.length}</p>
          <ReviewPanel
            key={JSON.stringify(meta.claim)}
            listingId={id}
            claim={meta.claim}
            nextId={details.next}
            filters={filters}
            admin={details.admin}
          />
        </aside>
      </div>
      <MobileDecisionBar claim={meta.claim} />
    </>
  );
}

export default function ModerationReviewPage({ searchParams }: PageProps<"/moderation/review">) {
  return (
    <main className={`${pageContainer} flex-1 py-6 sm:py-10`}>
      <Suspense fallback={null}>
        <BackLink searchParams={searchParams} />
      </Suspense>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-navy sm:text-3xl">
        განცხადების განხილვა
      </h1>
      <div className="mt-6">
        <Suspense fallback={<p className="text-sm text-muted">იტვირთება…</p>}>
          <Review searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

/** Back to the queue, keeping its filters. */
async function BackLink({ searchParams }: Pick<PageProps<"/moderation/review">, "searchParams">) {
  const params = await searchParams;
  const filters = cleanQueueFilters({ city: first(params.city), type: first(params.type) });
  return (
    <Link
      href={`/moderation${queueQuery(filters)}`}
      className="text-sm font-medium text-muted hover:text-ink"
    >
      ← რიგი
    </Link>
  );
}
