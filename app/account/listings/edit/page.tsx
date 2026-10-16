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
import { getDraftForUser } from "@/lib/drafts/draft-service";
import { draftDeps } from "@/lib/drafts/instance";
import { photoDeps } from "@/lib/photos/instance";
import { listDraftPhotos } from "@/lib/photos/photo-service";

export const metadata: Metadata = {
  title: "დრაფტის რედაქტირება | Property Intelligence",
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
  const item = await getDraftForUser(draftDeps, id);
  if (!item) notFound();
  const [rateState, { districts }, photos] = await Promise.all([
    getExchangeRateState(),
    getSearchFacets(),
    listDraftPhotos(photoDeps, item.listing.id),
  ]);
  return (
    <ListingDraftWizard
      rateState={rateState}
      districts={districts}
      initialDraft={recordsToDraft(item)}
      draftId={item.listing.id}
      initialPhotos={photos ?? []}
    />
  );
}

export default function EditDraftPage({ searchParams }: PageProps<"/account/listings/edit">) {
  return (
    <main className={`${pageContainer} flex-1 py-6 sm:py-10`}>
      <Link href="/account/listings" className="text-sm font-medium text-muted hover:text-ink">
        ← ჩემი განცხადებები
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-navy sm:text-3xl">
        დრაფტის რედაქტირება
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
