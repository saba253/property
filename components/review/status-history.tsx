import { formatWhen } from "@/lib/review/format-time";
import type { StatusEvent } from "@/lib/review/review-store";
import { STATUS_TEXT } from "@/lib/review/statuses";

/** What an event did, in Georgian. Claims and releases are shown to moderators only. */
export function eventLabel(event: Pick<StatusEvent, "kind" | "to">): string {
  if (event.kind === "claim") return "აღებულია განსახილველად";
  if (event.kind === "release") return "განხილვა გათავისუფლდა";
  return STATUS_TEXT[event.to].label;
}

/** History from the audit trail (roles only, never who exactly). */
export function StatusHistory({
  events,
  viewer,
}: {
  events: readonly StatusEvent[];
  viewer: "owner" | "moderator";
}) {
  const shown = viewer === "owner" ? events.filter((event) => event.kind === "status") : events;
  if (shown.length === 0) return null;
  return (
    <section aria-labelledby="status-history" className="mt-8">
      <h2 id="status-history" className="text-base font-semibold text-navy">
        {viewer === "owner" ? "სტატუსის ისტორია" : "განხილვის ისტორია"}
      </h2>
      <ol className="mt-3 space-y-2">
        {shown.map((event, index) => (
          <li
            key={index}
            className={`rounded-xl border px-3 py-2 text-sm ${
              event.kind === "status"
                ? "border-line bg-surface"
                : "border-dashed border-line bg-cream/40"
            }`}
          >
            <p className="text-navy">
              <span className={event.kind === "status" ? "font-semibold" : "font-medium"}>
                {eventLabel(event)}
              </span>
              <span className="text-subtle">
                {" "}
                ·{" "}
                {event.actorRole === "moderator"
                  ? "მოდერატორი"
                  : viewer === "owner"
                    ? "თქვენ"
                    : "მფლობელი"}{" "}
                · {formatWhen(event.at)}
              </span>
            </p>
            {event.reason && <p className="mt-1 whitespace-pre-line text-muted">{event.reason}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
