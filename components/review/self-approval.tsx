"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { selfApproveAction } from "@/app/moderation/actions";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";
import { MAX_REASON_LENGTH, SELF_APPROVAL_CONFIRMATION } from "@/lib/review/statuses";

/*
 * Administrator self-approval of their own submitted listing. Shown only to the administrator
 * (checked on the server for the page, and again in the action and the database). It needs an
 * explicit checkbox and a second confirmation; it is recorded separately in the audit log as a
 * self-approval and never publishes anything.
 */

const ERRORS: Record<string, string> = {
  unauthenticated: "სესია დასრულდა. შედით თავიდან.",
  forbidden: "ადმინისტრატორის უფლება არ გაქვთ.",
  "not-found": "განცხადება ვერ მოიძებნა.",
  conflict: "განცხადება აღარ არის განხილვაზე.",
  claimed: "ამ განცხადებას ახლა მოდერატორი განიხილავს. დაელოდეთ მის გადაწყვეტილებას.",
  "confirmation-required": "მონიშნეთ დადასტურება.",
  "rate-limited": "ძალიან ბევრი მოქმედება მოკლე დროში. სცადეთ მოგვიანებით.",
  unavailable: "ახლა ვერ მოხერხდა. სცადეთ ცოტა ხანში.",
};

export function SelfApproval({ listingId }: { listingId: string }) {
  const router = useRouter();
  const checkId = useId();
  const noteId = useId();
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setPending(true);
    setError(null);
    const result = await selfApproveAction(
      listingId,
      checked ? SELF_APPROVAL_CONFIRMATION : null,
      note.trim() || null,
    ).catch(() => null);
    setPending(false);
    setConfirming(false);
    if (result?.ok) router.refresh();
    else setError(ERRORS[result?.reason ?? "unavailable"] ?? ERRORS.unavailable);
  }

  return (
    <section
      aria-labelledby="self-approval-title"
      className="mt-4 space-y-3 rounded-xl border border-sand-200 bg-cream p-4"
    >
      <h2 id="self-approval-title" className="text-sm font-semibold text-navy">
        ადმინისტრატორის თვითდამტკიცება
      </h2>
      <p className="text-sm text-muted">
        ეს თქვენი განცხადებაა. როგორც ადმინისტრატორს, შეგიძლიათ თავად დაამტკიცოთ. ქმედება აუდიტში
        ცალკე ჩაიწერება „თვითდამტკიცებად“. განცხადება ამით არ ქვეყნდება.
      </p>
      <label htmlFor={noteId} className="block text-sm font-medium text-navy">
        შენიშვნა <span className="font-normal text-subtle">(არასავალდებულო)</span>
        <textarea
          id={noteId}
          value={note}
          maxLength={MAX_REASON_LENGTH}
          rows={2}
          onChange={(event) => setNote(event.target.value)}
          className="mt-1 w-full rounded-xl border border-line-strong bg-white px-3 py-2 text-sm text-ink focus:border-navy focus:outline-none"
        />
      </label>
      <label htmlFor={checkId} className="flex items-start gap-2 text-sm text-navy">
        <input
          id={checkId}
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-navy"
        />
        ვადასტურებ, რომ განცხადება შევამოწმე და ვამტკიცებ მოდერატორის გარეშე.
      </label>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200"
        >
          {error}
        </p>
      )}
      {confirming ? (
        <div role="group" aria-label="დადასტურება" className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-navy">დავამტკიცოთ თქვენი განცხადება?</span>
          <button
            type="button"
            disabled={pending}
            onClick={approve}
            className={`${buttonPrimary} h-12 px-4 text-sm disabled:opacity-60`}
          >
            {pending ? "მიმდინარეობს…" : "დიახ, თვითდამტკიცება"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className={`${buttonSecondary} h-12 px-4 text-sm`}
          >
            გაუქმება
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={!checked}
          onClick={() => setConfirming(true)}
          className={`${buttonPrimary} h-12 px-4 text-sm disabled:opacity-50`}
        >
          თვითდამტკიცება
        </button>
      )}
    </section>
  );
}
