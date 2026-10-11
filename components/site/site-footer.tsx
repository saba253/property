import Link from "next/link";
import { pageContainer } from "@/components/ui/styles";

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-navy text-white">
      <div className={`${pageContainer} flex flex-col gap-4 py-8 sm:flex-row sm:justify-between`}>
        <div className="max-w-2xl space-y-2 text-sm leading-6 text-white/70">
          <p className="flex items-center gap-2 font-semibold text-white">
            <span aria-hidden="true" className="h-px w-6 bg-sand-500" />
            Property Intelligence
          </p>
          <p>
            პლატფორმა შემუშავების პროცესშია. შინაარსი ინფორმაციული ხასიათისაა და არ წარმოადგენს
            საინვესტიციო ან იურიდიულ რჩევას.
          </p>
          <p>
            საიტზე ნაჩვენები განცხადებები დემო მონაცემებია. ფასები განცხადებებში მითითებული ფასებია
            და არა გარიგების დადასტურებული ფასები.
          </p>
        </div>

        <nav aria-label="ქვედა ნავიგაცია" className="flex gap-4 text-sm sm:flex-col sm:items-end">
          <Link href="/" className="text-white/70 hover:text-white">
            მთავარი
          </Link>
          <Link href="/properties" className="text-white/70 hover:text-white">
            დემო განცხადებები
          </Link>
        </nav>
      </div>
    </footer>
  );
}
