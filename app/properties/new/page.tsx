import type { Metadata } from "next";
import { ListingDraftWizard } from "@/components/listing-draft/listing-draft-wizard";
import { DemoNotice } from "@/components/properties/demo-label";
import { pageContainer } from "@/components/ui/styles";
import { getExchangeRateState } from "@/lib/currency/get-exchange-rate";
import { getSearchFacets } from "@/lib/data/listings";

export const metadata: Metadata = {
  title: "განცხადების მომზადება (დემო) | Property Intelligence",
  // Demo pages must not be indexed by search engines.
  robots: { index: false, follow: false },
};

/**
 * Listing draft workflow. The form works in the browser; nothing is ever published. Signed-in
 * users can store the reviewed draft privately (DraftSavePanel, Server Action); otherwise it
 * lives only in this tab. The server provides the cached NBG rate and district suggestions.
 */
export default async function NewListingPage() {
  const rateState = await getExchangeRateState();
  const { districts } = await getSearchFacets();

  return (
    <main className={`${pageContainer} flex-1 py-6 sm:py-10`}>
      <div className="max-w-3xl">
        <p className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-300">
          დემო · ლოკალური დრაფტი
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-navy sm:text-4xl">
          განცხადების მომზადება
        </h1>
        <p className="mt-2 text-base leading-7 text-muted">
          შეავსეთ ნაბიჯ-ნაბიჯ და ბოლოს ნახეთ, როგორ გამოჩნდება განცხადება. ფასი კვადრატულ მეტრზე
          ავტომატურად გამოითვლება.
        </p>
      </div>

      <div className="mt-5 max-w-3xl">
        <DemoNotice title="არაფერი ქვეყნდება.">
          ანგარიშით შესულს შეუძლია დრაფტის და მისი ფოტოების პირადად შენახვა. სხვა შემთხვევაში დრაფტი
          და ფოტოები მხოლოდ ამ ჩანართშია და გვერდის განახლების ან დახურვის შემდეგ დაიკარგება.
        </DemoNotice>
      </div>

      <div className="mt-8">
        <ListingDraftWizard rateState={rateState} districts={districts} />
      </div>
    </main>
  );
}
