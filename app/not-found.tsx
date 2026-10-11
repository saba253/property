import Link from "next/link";
import { buttonPrimary, buttonSecondary, pageContainer } from "@/components/ui/styles";

export default function NotFound() {
  return (
    <main className={`${pageContainer} flex flex-1 flex-col items-start justify-center py-16`}>
      <p className="text-sm font-semibold text-sand-700">404</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-navy sm:text-4xl">
        გვერდი ვერ მოიძებნა
      </h1>

      <p className="mt-4 text-muted">მოთხოვნილი გვერდი არ არსებობს ან გადატანილია.</p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/" className={buttonPrimary}>
          მთავარ გვერდზე დაბრუნება
        </Link>
        <Link href="/properties" className={buttonSecondary}>
          დემო განცხადებები
        </Link>
      </div>
    </main>
  );
}
