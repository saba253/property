"use client";

import Link from "next/link";
import { useState } from "react";
import { saveDraftAction } from "@/app/account/listings/actions";
import { useAccountStatus } from "@/components/auth/use-account-status";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";
import type { ListingDraft } from "@/lib/listing-draft/draft";

/*
 * Saving the reviewed draft. Signed-in users store it as a private database draft (Server
 * Action; the owner comes from the server session). Visitors keep the existing local-only form:
 * before going to the login page their entries are parked in this tab's sessionStorage (no
 * photos, no secrets) and restored afterwards, so nothing is lost on the way. Success is shown
 * only after the server confirmed that the draft was stored.
 */

/** Where the form is parked while the visitor signs in (this tab only, removed on restore). */
export const DRAFT_RESUME_KEY = "property-intelligence:listing-draft-resume:v1";

const SAVE_ERRORS: Record<string, string> = {
  unauthenticated: "სესია დასრულდა. შედით ანგარიშში და სცადეთ თავიდან.",
  invalid: "დრაფტში შეცდომაა. გადაამოწმეთ მონაცემები.",
  "not-found": "ეს დრაფტი ვერ მოიძებნა.",
  limit: "დრაფტების მაქსიმალურ რაოდენობას მიაღწიეთ. ჯერ წაშალეთ ძველი დრაფტი.",
  "rate-limited": "ძალიან ბევრი შენახვა მოკლე დროში. სცადეთ რამდენიმე წუთში.",
  unavailable: "შენახვა ახლა ვერ მოხერხდა. სცადეთ ცოტა ხანში.",
};

export function DraftSavePanel({
  draft,
  draftId,
  saved,
  onSaved,
}: {
  draft: ListingDraft;
  draftId: string | null;
  /** True when the current entries equal the last successfully saved version. */
  saved: boolean;
  onSaved: (id: string) => void;
}) {
  const status = useAccountStatus();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLocalPhotos = draft.photos.length > 0;

  if (!status?.enabled || !status.signedIn) {
    return (
      <div className="mt-4 space-y-2 text-sm leading-6 text-muted">
        <p>
          გამოქვეყნება ამ ეტაპზე შეუძლებელია. ეს დრაფტი მხოლოდ ამ გვერდზეა — გვერდის განახლების ან
          დახურვის შემდეგ ის დაიკარგება.
        </p>
        {status?.enabled && !status.signedIn && hasLocalPhotos && (
          <p className="text-amber-900">
            არჩეული ფოტოები მხოლოდ ამ გვერდზე ჩანს. შესვლის და დრაფტის შენახვის შემდეგ ფოტოები
            ხელახლა უნდა აირჩიოთ — ისინი შენახულ დრაფტთან ერთად დაიტვირთება.
          </p>
        )}
        {status?.enabled && !status.signedIn && (
          <button
            type="button"
            className={buttonSecondary}
            onClick={() => {
              try {
                sessionStorage.setItem(DRAFT_RESUME_KEY, JSON.stringify({ ...draft, photos: [] }));
              } catch {
                // Storage blocked: the login page still works, the entries just are not parked.
              }
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.assign("/login?next=%2Fproperties%2Fnew");
            }}
          >
            შედით, რომ დრაფტი შეინახოთ
          </button>
        )}
      </div>
    );
  }

  async function save() {
    setPending(true);
    setError(null);
    const result = await saveDraftAction({ ...draft, photos: [] }, draftId).catch(() => null);
    setPending(false);
    if (result?.ok) onSaved(result.id);
    else setError(SAVE_ERRORS[result?.reason ?? "unavailable"] ?? SAVE_ERRORS.unavailable);
  }

  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm leading-6 text-muted">
        დრაფტი პირადია: მას მხოლოდ თქვენ ხედავთ და ის არ ქვეყნდება. გამოქვეყნება მოგვიანებით
        დაემატება.
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200"
        >
          {error}
        </p>
      )}
      {saved ? (
        <p
          role="status"
          className="rounded-xl bg-accent-50 px-3 py-2 text-sm text-navy ring-1 ring-accent-100"
        >
          დრაფტი შენახულია.{" "}
          <Link href="/account/listings" className="font-semibold text-accent-700 hover:underline">
            ჩემი განცხადებები
          </Link>
        </p>
      ) : (
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className={`${buttonPrimary} disabled:opacity-60`}
        >
          {pending ? "ინახება…" : draftId ? "ცვლილებების შენახვა" : "შენახვა დრაფტად"}
        </button>
      )}
    </div>
  );
}
