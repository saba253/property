import { CHANGE_LABELS } from "@/lib/review/changes";
import type { ChangeSummary as Summary } from "@/lib/review/review-store";

/** Which fields changed since the previous submission (names only, never old values). */
export function ChangeSummary({ changes }: { changes: Summary }) {
  let body: React.ReactNode;
  if (changes.kind === "first") {
    body = <p className="text-sm text-muted">პირველი გაგზავნა: შესადარებელი არაფერია.</p>;
  } else if (changes.kind === "unknown") {
    body = (
      <p className="text-sm text-muted">
        შედარება მიუწვდომელია: წინა გაგზავნა ცვლილებების აღრიცხვის დამატებამდე მოხდა.
      </p>
    );
  } else if (changes.fields.length === 0) {
    body = <p className="text-sm text-muted">წინა გაგზავნის შემდეგ ველები არ შეცვლილა.</p>;
  } else {
    body = (
      <ul className="flex flex-wrap gap-1.5">
        {changes.fields.map((field) => (
          <li
            key={field}
            className="rounded-full bg-cream px-2.5 py-0.5 text-xs font-semibold text-navy ring-1 ring-sand-200"
          >
            {CHANGE_LABELS[field]}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <section
      aria-labelledby="change-summary"
      className="mb-6 rounded-card border border-line bg-surface p-4"
    >
      <h2 id="change-summary" className="mb-2 text-sm font-semibold text-navy">
        ცვლილებები წინა გაგზავნასთან შედარებით
      </h2>
      {body}
    </section>
  );
}
