"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { submitForReviewAction, withdrawSubmissionAction } from "@/app/account/listings/actions";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";
import type { UserListingStatus } from "@/lib/review/statuses";

/*
 * Submit for review (draft, changes requested) or withdraw a submission (before a decision),
 * each after an inline confirmation. The server re-checks everything; errors are explained in
 * Georgian and the page is refreshed after a change.
 */

export const SUBMIT_ERRORS: Record<string, string> = {
  unauthenticated: "სესია დასრულდა. შედით ანგარიშში და სცადეთ თავიდან.",
  "not-found": "განცხადება ვერ მოიძებნა.",
  conflict: "განცხადების სტატუსი უკვე შეიცვალა. განაახლეთ გვერდი.",
  incomplete: "განცხადება არასრულია. გახსენით, შეავსეთ ყველა სავალდებულო ველი და შეინახეთ.",
  "no-photo": "გასაგზავნად საჭიროა მინიმუმ ერთი შენახული ფოტო.",
  "rate-limited": "დღეს ძალიან ბევრი განცხადება გაგზავნეთ. სცადეთ ხვალ.",
  unavailable: "ახლა ვერ მოხერხდა. სცადეთ ცოტა ხანში.",
};

export function ListingReviewControls({
  listingId,
  status,
  photoCount,
  onDone,
}: {
  listingId: string;
  status: UserListingStatus;
  photoCount: number;
  /** Called after a successful change (default: refresh the page). */
  onDone?: () => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = status === "draft" || status === "changes_requested";
  const canWithdraw = status === "submitted";
  if (!canSubmit && !canWithdraw) return null;

  async function run() {
    setPending(true);
    setError(null);
    const action = canSubmit ? submitForReviewAction : withdrawSubmissionAction;
    const result = await action(listingId).catch(() => null);
    setPending(false);
    setConfirming(false);
    if (result?.ok) {
      if (onDone) onDone();
      else router.refresh();
    } else {
      setError(SUBMIT_ERRORS[result?.reason ?? "unavailable"] ?? SUBMIT_ERRORS.unavailable);
    }
  }

  const label = canSubmit
    ? status === "changes_requested"
      ? "ხელახლა გაგზავნა"
      : "განსახილველად გაგზავნა"
    : "გაგზავნის გაუქმება";

  return (
    <div className="space-y-2">
      {canSubmit && photoCount < 1 && (
        <p className="text-sm text-amber-900">გასაგზავნად საჭიროა მინიმუმ ერთი შენახული ფოტო.</p>
      )}
      {confirming ? (
        <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">
            {canSubmit
              ? "განხილვის დროს განცხადებას ვერ შეცვლით. გავაგზავნოთ?"
              : "განცხადება დაბრუნდება დრაფტად. გავაუქმოთ გაგზავნა?"}
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={run}
            className={`${buttonPrimary} h-10 px-4 text-sm disabled:opacity-60`}
          >
            {pending ? "მიმდინარეობს…" : "დიახ"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className={`${buttonSecondary} h-10 px-4 text-sm`}
          >
            არა
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={canSubmit && photoCount < 1}
          onClick={() => setConfirming(true)}
          className={`${canSubmit ? buttonPrimary : buttonSecondary} h-10 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {label}
        </button>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200"
        >
          {error}
        </p>
      )}
    </div>
  );
}
