import type { ClaimState } from "@/lib/review/review-store";
import { minutesLeft } from "@/lib/review/format-time";

/** Assignment state of a submitted listing, as the viewing moderator sees it. */
export function ClaimBadge({ claim }: { claim: ClaimState }) {
  if (claim.state === "free") {
    return (
      <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold text-muted ring-1 ring-line-strong">
        თავისუფალია
      </span>
    );
  }
  if (claim.state === "mine") {
    return (
      <span className="rounded-full bg-navy px-2.5 py-0.5 text-xs font-semibold text-white">
        თქვენ განიხილავთ · დარჩა {minutesLeft(claim.secondsLeft)} წთ
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
      სხვა მოდერატორი განიხილავს · {minutesLeft(claim.secondsLeft)} წთ
    </span>
  );
}

/** First submission or the n-th resubmission. */
export function SubmissionBadge({ number }: { number: number }) {
  return number > 1 ? (
    <span className="rounded-full bg-cream px-2.5 py-0.5 text-xs font-semibold text-navy ring-1 ring-sand-200">
      ხელახლა გაგზავნილი ({number}-ე)
    </span>
  ) : (
    <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold text-muted ring-1 ring-line">
      პირველი გაგზავნა
    </span>
  );
}
