import type { ReactNode } from "react";
import { card, pageContainer } from "@/components/ui/styles";

/** Compact, centered frame shared by the account pages. */
export function AuthShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className={`${pageContainer} flex flex-1 justify-center py-8 sm:py-14`}>
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">{title}</h1>
        {intro && <div className="mt-2 text-sm leading-6 text-muted">{intro}</div>}
        <div className={`${card} mt-6 p-5 sm:p-6`}>{children}</div>
      </div>
    </main>
  );
}

/** Shown instead of forms while accounts are not configured: no fake sign-up or sign-in. */
export function AuthUnavailable() {
  return (
    <div role="note" className="text-sm leading-6 text-ink">
      <p className="font-semibold text-navy">ანგარიშები ჯერ არ არის ჩართული.</p>
      <p className="mt-2 text-muted">
        პლატფორმა სადემონსტრაციო რეჟიმშია: რეგისტრაცია და შესვლა ჩაირთვება, როცა მონაცემთა ბაზა და
        ელფოსტის გაგზავნა მომზადდება. ძიება, რჩეულები და შედარება ანგარიშის გარეშეც მუშაობს და
        ინახება ამ ბრაუზერში.
      </p>
    </div>
  );
}

/** Small status message inside a form (errors are announced to screen readers). */
export function FormMessage({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl px-3 py-2 text-sm leading-6 ${
        tone === "error"
          ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200"
          : "bg-accent-50 text-navy ring-1 ring-accent-100"
      }`}
    >
      {children}
    </p>
  );
}
