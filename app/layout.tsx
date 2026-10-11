import type { Metadata } from "next";
import { Noto_Sans_Georgian } from "next/font/google";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
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
  return (
    <html lang="ka" className={`${notoSansGeorgian.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
