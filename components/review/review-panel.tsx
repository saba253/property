"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { claimAction, releaseAction } from "@/app/moderation/actions";
import { DECISION_ERRORS, ModerationDecision } from "@/components/review/moderation-decision";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";
import { minutesLeft } from "@/lib/review/format-time";
import { queueQuery } from "@/lib/review/queue-query";
import { CLAIM_MINUTES } from "@/lib/review/statuses";

/*
 * Assignment and decision for one submitted listing. A moderator first claims it
 * ("ავიღებ განსახილველად", CLAIM_MINUTES minutes); only then the decision controls appear. The
 * remaining time counts down from the server's value (database clock); when it runs out the
 * controls disappear. Every rule is enforced again on the server and in the database.
 */

export type PanelClaim =
  | { state: "free" }
  | { state: "mine"; secondsLeft: number }
  | { state: "other"; secondsLeft: number };

export function ReviewPanel({
  listingId,
  claim,
  nextId,
  filters,
}: {
  listingId: string;
  claim: PanelClaim;
  nextId: string | null;
  filters: { city?: string; propertyType?: string };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(claim.state === "free" ? 0 : claim.secondsLeft);
  const startedAt = useRef(0);

  // Count down locally from the server's remaining time (not the browser's clock time). The
  // page gives this component a new key whenever the server reports a new claim state.
  useEffect(() => {
    if (claim.state === "free") return;
    startedAt.current = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
      setSecondsLeft(Math.max(0, claim.secondsLeft - elapsed));
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [claim]);

  const state = claim.state !== "free" && secondsLeft <= 0 ? "free" : claim.state;

  async function run(action: typeof claimAction) {
    setPending(true);
    setError(null);
    const result = await action(listingId).catch(() => null);
    setPending(false);
    if (!result?.ok) {
      setError(DECISION_ERRORS[result?.reason ?? "unavailable"] ?? DECISION_ERRORS.unavailable);
    }
    router.refresh();
  }

  const nextLink = nextId ? (
    <Link
      href={`/moderation/review${queueQuery(filters, { listing: nextId })}`}
      className="inline-flex min-h-10 items-center text-sm font-semibold text-accent-700 hover:underline"
    >
      შემდეგი განცხადება →
    </Link>
  ) : (
    <Link
      href={`/moderation${queueQuery(filters)}`}
      className="inline-flex min-h-10 items-center text-sm font-semibold text-accent-700 hover:underline"
    >
      რიგში დაბრუნება
    </Link>
  );

  return (
    <div className="space-y-4">
      <section aria-labelledby="claim-title" className="space-y-3">
        <h2 id="claim-title" className="text-base font-semibold text-navy">
          განხილვის მინიჭება
        </h2>
        {state === "free" && (
          <>
            <p className="text-sm text-muted">
              {claim.state !== "free"
                ? "აღების ვადა ამოიწურა. შეგიძლიათ ხელახლა აიღოთ."
                : `განცხადება თავისუფალია. აიღეთ, რომ გადაწყვეტილება მიიღოთ (${CLAIM_MINUTES} წუთი).`}
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(claimAction)}
              className={`${buttonPrimary} h-12 w-full px-4 text-sm disabled:opacity-60`}
            >
              {pending ? "მიმდინარეობს…" : "ავიღებ განსახილველად"}
            </button>
          </>
        )}
        {state === "mine" && (
          <>
            <p className="rounded-xl bg-cream px-3 py-2 text-sm text-navy ring-1 ring-line">
              თქვენ განიხილავთ. დარჩა დაახლოებით <strong>{minutesLeft(secondsLeft)} წუთი</strong>.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(claimAction)}
                className={`${buttonSecondary} h-10 px-4 text-sm disabled:opacity-60`}
              >
                ვადის გაგრძელება
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(releaseAction)}
                className={`${buttonSecondary} h-10 px-4 text-sm disabled:opacity-60`}
              >
                გათავისუფლება
              </button>
            </div>
          </>
        )}
        {state === "other" && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            ამ განცხადებას ახლა სხვა მოდერატორი განიხილავს (დარჩა ~{minutesLeft(secondsLeft)} წთ).
            ვადის ამოწურვის შემდეგ შეძლებთ მის აღებას.
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200"
          >
            {error}
          </p>
        )}
      </section>
      {state === "mine" && (
        <div className="border-t border-line pt-4">
          <ModerationDecision
            listingId={listingId}
            filters={filters}
            onExpired={() => router.refresh()}
          />
        </div>
      )}
      <div className="border-t border-line pt-3">{nextLink}</div>
    </div>
  );
}

/**
 * Phones and tablets: a compact bar at the bottom of the viewport with the assignment state and
 * a jump to the decision panel. It is part of the page flow (sticky), hides while the panel
 * itself is visible, and the page ends with its own space, so no content stays covered.
 */
export function MobileDecisionBar({ claim }: { claim: PanelClaim }) {
  const [panelVisible, setPanelVisible] = useState(false);
  useEffect(() => {
    const panel = document.getElementById("review-panel");
    if (!panel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setPanelVisible(entry.isIntersecting), {
      threshold: 0.05,
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);
  if (panelVisible) return null;
  const text =
    claim.state === "mine"
      ? `თქვენ განიხილავთ · ${minutesLeft(claim.secondsLeft)} წთ`
      : claim.state === "other"
        ? "სხვა მოდერატორი განიხილავს"
        : "თავისუფალია";
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-line bg-surface/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm text-navy">{text}</span>
        <a href="#review-panel" className={`${buttonPrimary} h-11 shrink-0 px-4 text-sm`}>
          {claim.state === "mine" ? "გადაწყვეტილება ↓" : "განხილვა ↓"}
        </a>
      </div>
    </div>
  );
}
