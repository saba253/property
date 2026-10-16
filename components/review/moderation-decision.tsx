"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { decideAction } from "@/app/moderation/actions";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";
import { MAX_REASON_LENGTH } from "@/lib/review/statuses";

/*
 * Moderator decision on one submitted listing: approve, request changes or reject. Change
 * requests and rejections need a written reason; every decision asks for a confirmation. The
 * server checks the role, the status and the reason again.
 */

type Kind = "approve" | "request-changes" | "reject";

const ERRORS: Record<string, string> = {
  unauthenticated: "სესია დასრულდა. შედით თავიდან.",
  forbidden: "მოდერატორის უფლება არ გაქვთ.",
  "not-found": "განცხადება ვერ მოიძებნა.",
  conflict: "ამ განცხადებაზე გადაწყვეტილება უკვე მიღებულია ან ის გაუქმდა.",
  "own-listing": "საკუთარ განცხადებას ვერ განიხილავთ.",
  "reason-required": "მიუთითეთ მიზეზი (1–1000 სიმბოლო).",
  "rate-limited": "ძალიან ბევრი მოქმედება მოკლე დროში. სცადეთ მოგვიანებით.",
  unavailable: "ახლა ვერ მოხერხდა. სცადეთ ცოტა ხანში.",
};

const CONFIRM: Record<Kind, { question: string; button: string }> = {
  approve: {
    question: "დავამტკიცოთ? განცხადება ჯერ არ გამოქვეყნდება.",
    button: "დიახ, დამტკიცება",
  },
  "request-changes": {
    question: "გავუგზავნოთ ავტორს ცვლილების მოთხოვნა?",
    button: "დიახ, გაგზავნა",
  },
  reject: {
    question: "უარვყოთ? ეს გადაწყვეტილება საბოლოოა.",
    button: "დიახ, უარყოფა",
  },
};

export function ModerationDecision({ listingId }: { listingId: string }) {
  const router = useRouter();
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState<Kind | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function ask(kind: Kind) {
    setError(null);
    if (kind !== "approve" && !reason.trim()) {
      setError(ERRORS["reason-required"]);
      document.getElementById(reasonId)?.focus();
      return;
    }
    setConfirming(kind);
  }

  async function decide(kind: Kind) {
    setPending(true);
    const result = await decideAction(listingId, kind, kind === "approve" ? null : reason).catch(
      () => null,
    );
    setPending(false);
    setConfirming(null);
    if (result?.ok) router.push("/moderation");
    else setError(ERRORS[result?.reason ?? "unavailable"] ?? ERRORS.unavailable);
  }

  return (
    <section aria-labelledby="decision-title" className="space-y-4">
      <h2 id="decision-title" className="text-base font-semibold text-navy">
        გადაწყვეტილება
      </h2>
      <div>
        <label htmlFor={reasonId} className="text-sm font-medium text-navy">
          მიზეზი / კომენტარი ავტორისთვის{" "}
          <span className="font-normal text-subtle">
            (სავალდებულოა ცვლილების მოთხოვნისა და უარყოფისთვის)
          </span>
        </label>
        <textarea
          id={reasonId}
          value={reason}
          maxLength={MAX_REASON_LENGTH}
          rows={4}
          onChange={(event) => setReason(event.target.value)}
          placeholder="მაგ. მთავარი ფოტო ბნელია; მიუთითეთ სართული სწორად."
          className="mt-1 w-full rounded-xl border border-line-strong bg-white px-3 py-2 text-sm text-ink placeholder:text-subtle focus:border-navy focus:outline-none"
        />
        <p className="mt-1 text-xs text-subtle">
          {reason.length} / {MAX_REASON_LENGTH}
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200"
        >
          {error}
        </p>
      )}
      {confirming ? (
        <div
          role="group"
          aria-label="დადასტურება"
          className="flex flex-wrap items-center gap-2 rounded-xl bg-cream p-3 ring-1 ring-line"
        >
          <span className="text-sm text-navy">{CONFIRM[confirming].question}</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => decide(confirming)}
            className={`${buttonPrimary} h-10 px-4 text-sm disabled:opacity-60`}
          >
            {pending ? "მიმდინარეობს…" : CONFIRM[confirming].button}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(null)}
            className={`${buttonSecondary} h-10 px-4 text-sm`}
          >
            გაუქმება
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => ask("approve")}
            className={`${buttonPrimary} h-10 px-4 text-sm`}
          >
            დამტკიცება
          </button>
          <button
            type="button"
            onClick={() => ask("request-changes")}
            className={`${buttonSecondary} h-10 px-4 text-sm`}
          >
            ცვლილების მოთხოვნა
          </button>
          <button
            type="button"
            onClick={() => ask("reject")}
            className={`${buttonSecondary} h-10 border-red-300 px-4 text-sm text-red-700 hover:border-red-600`}
          >
            უარყოფა
          </button>
        </div>
      )}
    </section>
  );
}
