import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-start justify-center px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">გვერდი ვერ მოიძებნა</h1>

      <p className="mt-4 text-slate-600">მოთხოვნილი გვერდი არ არსებობს ან გადატანილია.</p>

      <Link
        href="/"
        className="mt-8 inline-flex h-12 items-center justify-center rounded-full bg-slate-900 px-6 text-base font-medium text-white transition-colors hover:bg-slate-700"
      >
        მთავარ გვერდზე დაბრუნება
      </Link>
    </main>
  );
}
