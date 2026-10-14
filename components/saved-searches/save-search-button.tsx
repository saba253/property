"use client";

import Link from "next/link";
import { type FormEvent, useId, useRef, useState } from "react";
import { saveSearch, useSavedSearches } from "@/components/saved-searches/saved-searches-state";
import { fieldInput, fieldLabel } from "@/components/ui/styles";
import { useDismissableDetails } from "@/components/ui/use-dismissable-details";
import { MAX_SAVED_SEARCHES, MAX_SEARCH_NAME_LENGTH } from "@/lib/saved-searches/saved-searches";

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="h-4 w-4 shrink-0"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    >
      <path d="M5 3.5h10a.5.5 0 0 1 .5.5v12.5L10 13l-5.5 3.5V4a.5.5 0 0 1 .5-.5Z" />
    </svg>
  );
}

type SaveSearchButtonProps = {
  /** Canonical, validated query of the current search (computed on the server). */
  query: string;
  suggestedName: string;
  /** The criteria that will be saved, in Georgian. */
  criteria: readonly string[];
  /** Parts of the current search that are invalid or not understood and will not be saved. */
  ignored: readonly string[];
  /** False for the default search (nothing chosen yet). */
  saveable: boolean;
};

/**
 * "ძიების შენახვა": saves the current, validated search criteria in this browser. A native
 * <details> panel with a name field (the suggested name is used when it is left empty), the list
 * of criteria that will be saved, and anything that will be left out. Nothing is saved silently.
 */
export function SaveSearchButton({
  query,
  suggestedName,
  criteria,
  ignored,
  saveable,
}: SaveSearchButtonProps) {
  const { searches, status } = useSavedSearches();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const nameId = useId();
  useDismissableDetails(detailsRef);

  const alreadySaved = status !== "loading" && searches.find((search) => search.query === query);

  if (!saveable) {
    return (
      <button
        type="button"
        disabled
        title="ძიების შესანახად აირჩიეთ მინიმუმ ერთი ფილტრი"
        className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-full border border-line px-3 text-sm text-subtle"
      >
        <BookmarkIcon filled={false} />
        ძიების შენახვა
      </button>
    );
  }

  if (alreadySaved) {
    return (
      <Link
        href="/saved-searches"
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-navy bg-cream px-3 text-sm font-semibold text-navy"
      >
        <BookmarkIcon filled />
        ძიება შენახულია
      </Link>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = saveSearch(name.trim() || suggestedName, query);
    if (result.outcome === "full") {
      setMessage(`შეიძლება მაქსიმუმ ${MAX_SAVED_SEARCHES} ძიების შენახვა. ჯერ წაშალეთ ერთ-ერთი.`);
    } else if (result.outcome === "invalid") {
      setMessage("ამ ძიების შენახვა ვერ მოხერხდა.");
    } else {
      // "added" or "duplicate": the button turns into "ძიება შენახულია".
      setMessage(null);
      setName("");
      if (detailsRef.current) detailsRef.current.open = false;
    }
  }

  return (
    <details ref={detailsRef} className="group relative">
      <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-sm font-medium text-navy transition-colors hover:border-navy [&::-webkit-details-marker]:hidden">
        <BookmarkIcon filled={false} />
        ძიების შენახვა
      </summary>
      <form
        onSubmit={submit}
        className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-4 shadow-card-hover max-lg:fixed max-lg:inset-x-4 max-lg:top-auto max-lg:bottom-4 max-lg:z-[1300] max-lg:mx-auto max-lg:mt-0 max-lg:w-auto max-lg:max-w-md"
      >
        <label htmlFor={nameId} className={fieldLabel}>
          ძიების სახელი
        </label>
        <input
          id={nameId}
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_SEARCH_NAME_LENGTH}
          placeholder={suggestedName}
          className={fieldInput}
        />
        <p className="mt-1 text-xs text-subtle">ცარიელის შემთხვევაში: „{suggestedName}“</p>

        <p className="mt-3 text-xs font-semibold text-muted">შეინახება:</p>
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {criteria.map((criterion) => (
            <li key={criterion} className="rounded-full bg-cream px-2.5 py-1 text-xs text-navy">
              {criterion}
            </li>
          ))}
        </ul>

        {ignored.length > 0 && (
          <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 ring-1 ring-amber-200">
            <p className="font-semibold">არ შეინახება:</p>
            <ul className="mt-0.5 list-disc pl-4">
              {ignored.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {message && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {message}
          </p>
        )}

        <button
          type="submit"
          className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-full bg-navy text-sm font-semibold text-white hover:bg-navy-900"
        >
          შენახვა
        </button>
        <p className="mt-2 text-xs leading-5 text-muted">
          ინახება მხოლოდ ამ ბრაუზერში. შედეგები არ ინახება: ყოველ გახსნაზე ძიება თავიდან სრულდება.
          ხედი (სია ან რუქა) არ ინახება.
        </p>
        {status === "memory-only" && (
          <p className="mt-1 text-xs text-amber-900">
            ბრაუზერი მონაცემებს არ ინახავს: გვერდის განახლებისას ძიება დაიკარგება.
          </p>
        )}
      </form>
    </details>
  );
}
