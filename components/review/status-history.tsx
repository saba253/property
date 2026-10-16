import type { StatusEvent } from "@/lib/review/review-store";
import { STATUS_TEXT } from "@/lib/review/statuses";

function when(iso: string): string {
  return new Intl.DateTimeFormat("ka-GE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tbilisi",
  }).format(new Date(iso));
}

/** Status history from the audit trail (roles only, never who exactly). */
export function StatusHistory({
  events,
  viewer,
}: {
  events: readonly StatusEvent[];
  viewer: "owner" | "moderator";
}) {
  if (events.length === 0) return null;
  return (
    <section aria-labelledby="status-history" className="mt-8">
      <h2 id="status-history" className="text-base font-semibold text-navy">
        სტატუსის ისტორია
      </h2>
      <ol className="mt-3 space-y-2">
        {events.map((event, index) => (
          <li key={index} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">
            <p className="text-navy">
              <span className="font-semibold">{STATUS_TEXT[event.to].label}</span>
              <span className="text-subtle">
                {" "}
                ·{" "}
                {event.actorRole === "moderator"
                  ? "მოდერატორი"
                  : viewer === "owner"
                    ? "თქვენ"
                    : "მფლობელი"}{" "}
                · {when(event.at)}
              </span>
            </p>
            {event.reason && <p className="mt-1 whitespace-pre-line text-muted">{event.reason}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
