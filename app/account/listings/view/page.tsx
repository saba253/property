import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DraftPreview } from "@/components/listing-draft/draft-preview";
import { ListingReviewControls } from "@/components/review/listing-review-controls";
import { StatusBadge } from "@/components/review/status-badge";
import { SelfApproval } from "@/components/review/self-approval";
import { StatusHistory } from "@/components/review/status-history";
import { card, pageContainer } from "@/components/ui/styles";
import { getAuthStatus } from "@/lib/auth/instance";
import { getExchangeRateState } from "@/lib/currency/get-exchange-rate";
import { draftDeps } from "@/lib/drafts/instance";
import { storedAsDraftPhotos } from "@/lib/photos/photo-types";
import { currentUserIsAdmin, ownerListingView } from "@/lib/review/review-service";
import { EDITABLE_STATUSES, STATUS_TEXT } from "@/lib/review/statuses";

export const metadata: Metadata = {
  title: "ჩემი განცხადება | Property Intelligence",
  robots: { index: false, follow: false },
};

/*
 * Read-only view of one of the owner's listings in review or decided (submitted, approved,
 * rejected). Editable ones open in the editor instead. Another user's listing gives the same 404
 * as a missing one; nothing is cached.
 */
async function OwnerListing({
  searchParams,
}: Pick<PageProps<"/account/listings/view">, "searchParams">) {
  await connection();
  if (!getAuthStatus().enabled) notFound();
  const raw = (await searchParams).listing;
  const id = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  if ((await draftDeps.currentUserId()) === null) {
    redirect(`/login?next=${encodeURIComponent(`/account/listings/view?listing=${id}`)}`);
  }
  const view = await ownerListingView(draftDeps, id);
  if (!view) notFound();
  if (EDITABLE_STATUSES.includes(view.status)) {
    redirect(`/account/listings/edit?draft=${encodeURIComponent(id)}`);
  }
  const rateState = await getExchangeRateState();
  const decision = view.history.at(-1);
  // Only an administrator may approve their own submitted listing (checked again on submit).
  const canSelfApprove = view.status === "submitted" && (await currentUserIsAdmin(draftDeps));
  return (
    <>
      <div className={`${card} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={view.status} />
          <p className="text-sm text-muted">{STATUS_TEXT[view.status].note}</p>
        </div>
        {decision?.reason && (
          <p className="mt-3 rounded-xl bg-cream px-3 py-2 text-sm whitespace-pre-line text-navy ring-1 ring-line">
            <span className="font-semibold">მოდერატორის კომენტარი:</span> {decision.reason}
          </p>
        )}
        <div className="mt-3">
          <ListingReviewControls
            listingId={id}
            status={view.status}
            photoCount={view.photos.length}
          />
        </div>
        {canSelfApprove && <SelfApproval listingId={id} />}
      </div>
      <div className="mt-6">
        <DraftPreview
          item={view.item}
          photos={storedAsDraftPhotos(view.photos)}
          rateState={rateState}
          storedPhotos
          status={view.status}
        />
      </div>
      <StatusHistory events={view.history} viewer="owner" />
    </>
  );
}

export default function OwnerListingPage({ searchParams }: PageProps<"/account/listings/view">) {
  return (
    <main className={`${pageContainer} flex-1 py-6 sm:py-10`}>
      <Link href="/account/listings" className="text-sm font-medium text-muted hover:text-ink">
        ← ჩემი განცხადებები
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-navy sm:text-3xl">განცხადება</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
        პირადია და არ ქვეყნდება. განხილვის დროს და გადაწყვეტილების შემდეგ რედაქტირება შეუძლებელია.
      </p>
      <div className="mt-6">
        <Suspense fallback={<p className="text-sm text-muted">იტვირთება…</p>}>
          <OwnerListing searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
