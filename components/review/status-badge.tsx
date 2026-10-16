import { STATUS_TEXT, type UserListingStatus } from "@/lib/review/statuses";

const TONES: Record<UserListingStatus, string> = {
  draft: "bg-cream text-navy ring-line",
  submitted: "bg-accent-50 text-accent-700 ring-accent-100",
  changes_requested: "bg-amber-50 text-amber-900 ring-amber-200",
  approved: "bg-navy text-white ring-navy",
  rejected: "bg-red-50 text-red-800 ring-red-200",
  archived: "bg-surface text-subtle ring-line",
};

/** Review status of a private listing (navy/cream palette; blue for "in review"). */
export function StatusBadge({ status }: { status: UserListingStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${TONES[status]}`}
    >
      {STATUS_TEXT[status].label}
    </span>
  );
}
