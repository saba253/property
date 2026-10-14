"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import {
  deleteSearch,
  renameSearch,
  useSavedSearches,
} from "@/components/saved-searches/saved-searches-state";
import { buttonPrimary, fieldInput } from "@/components/ui/styles";
import type { DistrictOption } from "@/lib/properties/cities";
import {
  MAX_SAVED_SEARCHES,
  MAX_SEARCH_NAME_LENGTH,
  type SavedSearch,
  parseSavedSearchQuery,
} from "@/lib/saved-searches/saved-searches";

function SavedSearchCard({
  search,
  districts,
}: {
  search: SavedSearch;
  districts: readonly DistrictOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(search.name);
  // Same validation as /properties: invalid or obsolete parts are reported, not trusted.
  const parsed = parseSavedSearchQuery(search.query, { knownDistricts: districts });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim()) {
      renameSearch(search.id, name);
      setEditing(false);
    }
  }

  return (
    <li className="rounded-card border border-line bg-surface p-5 shadow-card">
      {editing ? (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-muted">ახალი სახელი</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={MAX_SEARCH_NAME_LENGTH}
              required
              autoFocus
              className={fieldInput}
            />
          </label>
          <button
            type="submit"
            className="h-11 rounded-full bg-navy px-4 text-sm font-semibold text-white hover:bg-navy-900"
          >
            შენახვა
          </button>
          <button
            type="button"
            onClick={() => {
              setName(search.name);
              setEditing(false);
            }}
            className="h-11 rounded-full px-3 text-sm text-navy hover:bg-cream"
          >
            გაუქმება
          </button>
        </form>
      ) : (
        <h2 className="text-lg font-semibold text-navy">{search.name}</h2>
      )}

      <ul aria-label="ძიების პარამეტრები" className="mt-3 flex flex-wrap gap-1.5">
        {parsed.criteria.map((criterion) => (
          <li key={criterion} className="rounded-full bg-cream px-2.5 py-1 text-xs text-navy">
            {criterion}
          </li>
        ))}
      </ul>

      {parsed.hasIgnoredParts && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          ზოგიერთი შენახული პარამეტრი აღარ მოქმედებს და ძიების გახსნისას არ გამოიყენება.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          href={parsed.href}
          className="inline-flex h-10 items-center rounded-full bg-navy px-4 text-sm font-semibold text-white hover:bg-navy-900"
        >
          ძიების გახსნა
        </Link>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`სახელის შეცვლა: ${search.name}`}
            className="h-10 rounded-full border border-line-strong px-4 text-sm font-medium text-navy hover:border-navy"
          >
            სახელის შეცვლა
          </button>
        )}
        <button
          type="button"
          onClick={() => deleteSearch(search.id)}
          aria-label={`წაშლა: ${search.name}`}
          className="h-10 rounded-full px-4 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          წაშლა
        </button>
      </div>
    </li>
  );
}

/**
 * Saved searches of this browser. No result counts are shown: they would not be live. Opening a
 * search runs the normal validated search on /properties.
 */
export function SavedSearchesList({ districts }: { districts: readonly DistrictOption[] }) {
  const { searches, status } = useSavedSearches();

  if (status === "loading") {
    return (
      <p role="status" className="mt-8 text-sm text-muted">
        შენახული ძიებები იტვირთება…
      </p>
    );
  }

  return (
    <div className="mt-6">
      {status === "memory-only" && (
        <p
          role="note"
          className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          ბრაუზერი ამ საიტისთვის მონაცემებს არ ინახავს, ამიტომ ძიებები მხოლოდ დროებითაა.
        </p>
      )}
      <p role="status" className="text-base font-semibold text-ink">
        {searches.length > 0
          ? `შენახულია ${searches.length} ძიება (მაქს. ${MAX_SAVED_SEARCHES})`
          : "შენახული ძიება ჯერ არ გაქვს."}
      </p>

      {searches.length > 0 ? (
        <ul className="mt-5 grid gap-5 md:grid-cols-2">
          {[...searches].reverse().map((search) => (
            <SavedSearchCard key={search.id} search={search} districts={districts} />
          ))}
        </ul>
      ) : (
        <div className="mt-5 rounded-card border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
          <p className="mx-auto max-w-md text-sm leading-6 text-muted">
            აირჩიეთ ფილტრები განცხადებების გვერდზე და დააჭირეთ „ძიების შენახვა“-ს. ასე ერთი დაჭერით
            დაუბრუნდებით იგივე ძიებას.
          </p>
          <Link href="/properties" className={`${buttonPrimary} mt-6`}>
            განცხადებების ძიება
          </Link>
        </div>
      )}
    </div>
  );
}
