import type { Metadata } from "next";
import { Noto_Sans_Georgian } from "next/font/google";
import { CompareCatalogProvider } from "@/components/compare/compare-state";
import { CompareTray } from "@/components/compare/compare-tray";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { buildListingDetailHref } from "@/lib/properties/filter-chips";
import { getActiveListings, getListingCovers } from "@/lib/data/listings";
import "./globals.css";

// Noto Sans Georgian supports the Georgian script.
const notoSansGeorgian = Noto_Sans_Georgian({
  variable: "--font-noto-sans-georgian",
  subsets: ["georgian", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Property Intelligence | უძრავი ქონების შედარება და ფასების ანალიზი",
  description:
    "უძრავი ქონების შედარებისა და განცხადებებში მითითებული ფასების გაგების პლატფორმა. პლატფორმა შემუშავების პროცესშია.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // What the comparison tray and buttons need about each available listing (cached read).
  const listings = await getActiveListings();
  const covers = await getListingCovers(listings.map((item) => item.listing.id));
  const compareCatalog = listings.map(({ listing }) => ({
    id: listing.id,
    title: listing.title,
    href: buildListingDetailHref(listing.id),
    transactionType: listing.transactionType,
    coverImage: covers[listing.id].coverImage,
  }));

  return (
    <html lang="ka" className={`${notoSansGeorgian.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <CompareCatalogProvider entries={compareCatalog}>
          <SiteHeader />
          {children}
          <SiteFooter />
          <CompareTray />
        </CompareCatalogProvider>
      </body>
    </html>
  );
}
