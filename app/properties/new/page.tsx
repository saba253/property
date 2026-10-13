import type { Metadata } from "next";
import { ListingDraftWizard } from "@/components/listing-draft/listing-draft-wizard";
import { DemoNotice } from "@/components/properties/demo-label";
import { pageContainer } from "@/components/ui/styles";
import { getExchangeRateState } from "@/lib/currency/get-exchange-rate";
import { getDistrictsPresentIn } from "@/lib/properties/cities";
import { demoProperties } from "@/lib/properties/demo-data";

export const metadata: Metadata = {
  title: "განცხადების მომზადება (დემო) | Property Intelligence",
  // Demo pages must not be indexed by search engines.
  robots: { index: false, follow: false },
};

/**
 * Demo listing draft workflow. Everything happens in the browser: the draft is never sent to the
 * server, stored, or published. The server only provides the cached NBG rate for the price
 * preview and district suggestions taken from the listing data.
 */
export default async function NewListingPage() {
  const rateState = await getExchangeRateState();
  const districts = getDistrictsPresentIn(demoProperties);

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
        <DemoNotice title="არაფერი ქვეყნდება და არაფერი ინახება.">
          დრაფტი არსებობს მხოლოდ ამ ბრაუზერის ჩანართში. ავტომატური შენახვა არ არის: გვერდის
          განახლების ან დახურვის შემდეგ შეყვანილი მონაცემები და ფოტოები დაიკარგება.
        </DemoNotice>
      </div>

      <div className="mt-8">
        <ListingDraftWizard rateState={rateState} districts={districts} />
      </div>
    </main>
  );
}
