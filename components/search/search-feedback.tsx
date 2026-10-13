import Link from "next/link";
import type { ParsedSearch, SearchNote } from "@/lib/search/parse-search-query";

const KIND_LABELS: Record<string, string> = {
  city: "ქალაქი",
  district: "უბანი",
  rooms: "ოთახების რაოდენობა",
  propertyType: "ქონების ტიპი",
  transaction: "გარიგების ტიპი",
  budget: "ბიუჯეტი",
};

function noteMessage(note: SearchNote): string {
  switch (note.code) {
    case "currency-assumed":
      return `ბიუჯეტის ვალუტა არ იყო მითითებული, ამიტომ აღქმულია ${note.currency}-ში.`;
    case "number-without-meaning":
      return `რიცხვი „${note.text}“ არ გამოიყენება: ფასისთვის მიუთითეთ ვალუტა ან „-მდე“/„-დან“, ოთახებისთვის — „ოთახი“.`;
    case "conflict":
      return `${KIND_LABELS[note.kind]} რამდენჯერმე, განსხვავებულად იყო მითითებული, ამიტომ არ გამოიყენება.`;
    case "rooms-capped":
      return "5-ზე მეტი ოთახი აღქმულია როგორც „5+ ოთახი“.";
    case "ambiguous-district":
      return `უბანი „${note.name}“ რამდენიმე ქალაქშია, ამიტომ არ გამოიყენება. მიუთითეთ ქალაქიც.`;
  }
}

/**
 * Shows how a homepage free-text search was interpreted: which terms became filters, which words
 * were not understood, and any assumptions. Nothing unrecognized is silently applied.
 */
export function SearchFeedback({ query, search }: { query: string; search: ParsedSearch }) {
  const nothingRecognized = search.recognized.length === 0;

  return (
    <div
      role="status"
      className={`mt-4 rounded-2xl border p-4 text-sm leading-6 ${
        nothingRecognized
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-accent-100 bg-accent-50 text-navy"
      }`}
    >
      <p>
        <span className="font-semibold">ძიება:</span> „{query}“
      </p>

      {nothingRecognized ? (
        <p className="mt-1">
          ვერ ამოვიცანით ძიების არცერთი სიტყვა, ამიტომ ფილტრები არ გამოყენებულა. სცადეთ ქალაქი,
          უბანი, ოთახების რაოდენობა ან ფასი, მაგალითად: „თბილისი 2 ოთახი 100000 დოლარამდე“.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted">ამოცნობილია:</span>
          {search.recognized.map((term) => (
            <span
              key={term.label}
              className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-navy ring-1 ring-accent-100"
            >
              {term.label}
            </span>
          ))}
        </div>
      )}

      {search.unrecognized.length > 0 && (
        <p className="mt-2 text-xs">
          <span className="font-medium">ვერ ამოვიცანით და არ გამოიყენება:</span>{" "}
          {search.unrecognized.map((word) => `„${word}“`).join(", ")}
        </p>
      )}

      {search.notes.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
          {search.notes.map((note, index) => (
            <li key={index}>{noteMessage(note)}</li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-xs">
        <Link href="/" className="font-semibold text-accent-700 hover:text-navy">
          ახალი ძიება
        </Link>
        <span className="text-muted"> · ან დააზუსტეთ ქვემოთ მოცემული ფილტრებით.</span>
      </p>
    </div>
  );
}
