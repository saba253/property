import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DraftPreview } from "@/components/listing-draft/draft-preview";
import { ModerationDecision } from "@/components/review/moderation-decision";
import { StatusHistory } from "@/components/review/status-history";
import { card, pageContainer } from "@/components/ui/styles";
import { getAuthStatus } from "@/lib/auth/instance";
import { getExchangeRateState } from "@/lib/currency/get-exchange-rate";
import { draftDeps } from "@/lib/drafts/instance";
import { storedAsDraftPhotos } from "@/lib/photos/photo-types";
import { reviewDetails } from "@/lib/review/review-service";

export const metadata: Metadata = {
  title: "განხილვა | Property Intelligence",
  robots: { index: false, follow: false },
};

/*
 * One submitted listing, read-only, for a moderator who does not own it: details, private photos
 * (served to moderators only while submitted) and history, then the decision. Everyone else, and
 * listings that are not submitted, get the ordinary 404.
 */
async function Review({ searchParams }: Pick<PageProps<"/moderation/review">, "searchParams">) {
  await connection();
  if (!getAuthStatus().enabled) notFound();
  const raw = (await searchParams).listing;
  const id = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const details = await reviewDetails(draftDeps, id);
  if (!details) notFound();
  const rateState = await getExchangeRateState();
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">
        <DraftPreview
          item={details.item}
          photos={storedAsDraftPhotos(details.photos)}
          rateState={rateState}
          storedPhotos
        />
        <StatusHistory events={details.history} viewer="moderator" />
      </div>
      <aside className={`${card} h-fit p-4 sm:p-5 lg:sticky lg:top-24`}>
        <p className="mb-3 text-sm text-muted">ფოტოები: {details.photos.length}</p>
        <ModerationDecision listingId={id} />
      </aside>
    </div>
  );
}

export default function ModerationReviewPage({ searchParams }: PageProps<"/moderation/review">) {
  return (
    <main className={`${pageContainer} flex-1 py-6 sm:py-10`}>
      <Link href="/moderation" className="text-sm font-medium text-muted hover:text-ink">
        ← რიგი
      </Link>
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
