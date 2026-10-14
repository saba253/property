import type { Metadata } from "next";
import { SavedSearchesList } from "@/components/saved-searches/saved-searches-list";
import { DemoDisclosure } from "@/components/properties/demo-label";
import { pageContainer } from "@/components/ui/styles";
import { getDistrictsPresentIn } from "@/lib/properties/cities";
import { getActiveDemoListingsWithProperties } from "@/lib/properties/get-demo-listing";

export const metadata: Metadata = {
  title: "შენახული ძიებები | Property Intelligence",
  // Demo pages must not be indexed by search engines.
  robots: { index: false, follow: false },
};

export default function SavedSearchesPage() {
  // Districts from the listing data, so saved districts are validated like on /properties.
  const districts = getDistrictsPresentIn(
    getActiveDemoListingsWithProperties().map((item) => item.property),
  );

  return (
    <main className={`${pageContainer} flex-1 py-6 sm:py-10`}>
      <h1 className="text-3xl font-bold tracking-tight text-navy sm:text-4xl">შენახული ძიებები</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
        ძიებები ინახება მხოლოდ ამ ბრაუზერში და არ სინქრონიზდება სხვა მოწყობილობებთან. ინახება მხოლოდ
        ძიების პარამეტრები: შედეგები ყოველ გახსნაზე თავიდან მოიძებნება. შეტყობინებები ახალ
        განცხადებებზე არ იგზავნება.
      </p>
      <div className="mt-4">
        <DemoDisclosure />
      </div>
      <SavedSearchesList districts={districts} />
    </main>
  );
}
