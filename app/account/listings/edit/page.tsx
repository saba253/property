import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ListingDraftWizard } from "@/components/listing-draft/listing-draft-wizard";
import { pageContainer } from "@/components/ui/styles";
import { getAuthStatus } from "@/lib/auth/instance";
import { getExchangeRateState } from "@/lib/currency/get-exchange-rate";
import { getSearchFacets } from "@/lib/data/listings";
import { recordsToDraft } from "@/lib/drafts/draft-input";
import { draftDeps } from "@/lib/drafts/instance";
import { ownerListingView } from "@/lib/review/review-service";
import { EDITABLE_STATUSES } from "@/lib/review/statuses";

export const metadata: Metadata = {
  title: "განცხადების რედაქტირება | Property Intelligence",
  robots: { index: false, follow: false },
};

/*
 * Reopens one of the signed-in user's drafts in the existing form. Ownership is checked on the
 * server: another user's draft (or a made-up id) gives the same 404 as a missing one. Saving goes
 * through the same Server Action, which checks the session and ownership again.
 */
async function EditDraft({
  searchParams,
}: Pick<PageProps<"/account/listings/edit">, "searchParams">) {
  await connection();
  if (!getAuthStatus().enabled) notFound();
  const raw = (await searchParams).draft;
  const id = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  if ((await draftDeps.currentUserId()) === null) {
    redirect(`/login?next=${encodeURIComponent(`/account/listings/edit?draft=${id}`)}`);
  }
  const view = await ownerListingView(draftDeps, id);
  if (!view) notFound();
  // Submitted, approved and rejected listings are read-only.
  if (!EDITABLE_STATUSES.includes(view.status)) {
    redirect(`/account/listings/view?listing=${encodeURIComponent(id)}`);
  }
  const [rateState, { districts }] = await Promise.all([getExchangeRateState(), getSearchFacets()]);
  const request = view.status === "changes_requested" ? view.history.at(-1)?.reason : null;
  return (
    <>
      {request && (
        <div
          role="note"
          className="mb-6 max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900"
        >
          <p className="font-semibold">მოდერატორმა ცვლილება მოითხოვა:</p>
          <p className="mt-1 whitespace-pre-line">{request}</p>
          <p className="mt-1">შეასწორეთ, შეინახეთ და ბოლო ნაბიჯზე ხელახლა გაგზავნეთ.</p>
        </div>
      )}
      <ListingDraftWizard
        rateState={rateState}
        districts={districts}
        initialDraft={recordsToDraft(view.item)}
        draftId={view.item.listing.id}
        initialPhotos={view.photos}
        initialStatus={view.status}
      />
    </>
  );
}

export default function EditDraftPage({ searchParams }: PageProps<"/account/listings/edit">) {
  return (
    <main className={`${pageContainer} flex-1 py-6 sm:py-10`}>
      <Link href="/account/listings" className="text-sm font-medium text-muted hover:text-ink">
        ← ჩემი განცხადებები
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-navy sm:text-3xl">
        განცხადების რედაქტირება
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
        დრაფტი პირადია და არ ქვეყნდება. ფოტოებს მხოლოდ თქვენ ხედავთ.
      </p>
      <div className="mt-6">
        <Suspense fallback={<p className="text-sm text-muted">იტვირთება…</p>}>
          <EditDraft searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
