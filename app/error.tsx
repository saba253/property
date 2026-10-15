"use client"; // Error boundaries must be Client Components.

import Link from "next/link";
import { buttonPrimary, buttonSecondary, pageContainer } from "@/components/ui/styles";

/**
 * Shown when a page cannot be rendered, for example when the listing database is unavailable
 * (DATA_BACKEND=postgres). It never shows technical details or substitute (demo) data; the cause
 * is logged on the server, and `digest` lets that log entry be found.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className={`${pageContainer} flex-1 py-16`}>
      <h1 className="text-2xl font-bold tracking-tight text-navy">
        მონაცემების ჩატვირთვა ვერ მოხერხდა
      </h1>
      <p className="mt-3 max-w-xl text-base leading-7 text-muted">
        განცხადებები დროებით მიუწვდომელია. სცადეთ ცოტა ხანში თავიდან.
      </p>
      {error.digest && <p className="mt-2 text-xs text-subtle">კოდი: {error.digest}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={() => retry()} className={buttonPrimary}>
          თავიდან ცდა
        </button>
        <Link href="/" className={buttonSecondary}>
          მთავარი გვერდი
        </Link>
      </div>
    </main>
  );
}
