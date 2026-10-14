import type { Metadata } from "next";
import { Noto_Sans_Georgian } from "next/font/google";
import { CompareCatalogProvider } from "@/components/compare/compare-state";
import { CompareTray } from "@/components/compare/compare-tray";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { buildListingDetailHref } from "@/lib/properties/filter-chips";
import {
  getActiveDemoListingsWithProperties,
  getDemoListingCover,
} from "@/lib/properties/get-demo-listing";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  // What the comparison tray and buttons need about each available listing (static demo data).
  const compareCatalog = getActiveDemoListingsWithProperties().map(({ listing }) => ({
    id: listing.id,
    title: listing.title,
    href: buildListingDetailHref(listing.id),
    transactionType: listing.transactionType,
    coverImage: getDemoListingCover(listing.id).coverImage,
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
