import {
  AMENITY_GROUP_LABELS,
  type AmenityGroup,
  groupAmenitiesByStatus,
} from "@/lib/properties/amenities";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import type { AmenityStatus } from "@/lib/properties/types";

const STATUS_TEXT: Record<AmenityStatus, string> = {
  yes: "არის",
  no: "არ არის",
  unknown: "არ არის მითითებული",
};

function StatusIcon({ status }: { status: AmenityStatus }) {
  if (status === "yes") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5 shrink-0 fill-navy">
        <path d="M10 1.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17Zm3.7 5.8a1 1 0 0 0-1.4 0L9 10.6 7.7 9.3a1 1 0 1 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4a1 1 0 0 0 0-1.4Z" />
      </svg>
    );
  }
  if (status === "no") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5 shrink-0 fill-muted">
        <path d="M10 1.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17ZM7.6 6.2a1 1 0 0 0-1.4 1.4L8.6 10l-2.4 2.4a1 1 0 1 0 1.4 1.4l2.4-2.4 2.4 2.4a1 1 0 0 0 1.4-1.4L11.4 10l2.4-2.4a1 1 0 0 0-1.4-1.4L10 8.6 7.6 6.2Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5 shrink-0">
      <circle
        cx="10"
        cy="10"
        r="7.5"
        fill="none"
        strokeWidth="1.5"
        strokeDasharray="2 2.2"
        className="stroke-subtle"
      />
    </svg>
  );
}

function AmenityGroupList({ item, group }: { item: ListingWithProperty; group: AmenityGroup }) {
  const byStatus = groupAmenitiesByStatus(item, group);
  const rows = (["yes", "no", "unknown"] as const).flatMap((status) =>
    byStatus[status].map((amenity) => ({ amenity, status })),
  );

  return (
    <div>
      <h3 className="text-sm font-semibold text-navy">{AMENITY_GROUP_LABELS[group]}</h3>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map(({ amenity, status }) => (
          <li
            key={amenity.key}
            className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5"
          >
            <StatusIcon status={status} />
            <span className={status === "yes" ? "text-ink" : "text-muted"}>{amenity.label}</span>
            <span
              className={`ml-auto text-xs ${status === "unknown" ? "text-subtle" : "text-muted"}`}
            >
              {STATUS_TEXT[status]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Amenities in two groups (building, equipment), each showing confirmed, absent and unknown. */
export function AmenityList({ item }: { item: ListingWithProperty }) {
  return (
    <div className="space-y-6">
      <AmenityGroupList item={item} group="property" />
      <AmenityGroupList item={item} group="listing" />
    </div>
  );
}
