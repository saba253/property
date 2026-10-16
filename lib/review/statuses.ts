/*
 * Lifecycle of user listings (private until publishing exists). The same table is enforced by the
 * database (migration 0005, trigger user_listing_status_change); tests keep them in sync.
 * No server code: safe for the browser.
 */

export const USER_LISTING_STATUSES = [
  "draft",
  "submitted",
  "changes_requested",
  "approved",
  "rejected",
  "archived",
] as const;
export type UserListingStatus = (typeof USER_LISTING_STATUSES)[number];

export type ReviewActor = "owner" | "moderator";

/** Statuses in which the owner may edit the listing and its photos. */
export const EDITABLE_STATUSES: readonly UserListingStatus[] = ["draft", "changes_requested"];

/** Allowed transitions: [from, to, who]. Everything else is refused. */
export const TRANSITIONS: readonly (readonly [
  UserListingStatus,
  UserListingStatus,
  ReviewActor,
])[] = [
  ["draft", "submitted", "owner"],
  ["changes_requested", "submitted", "owner"],
  ["submitted", "draft", "owner"],
  ["draft", "archived", "owner"],
  ["changes_requested", "archived", "owner"],
  ["approved", "archived", "owner"],
  ["rejected", "archived", "owner"],
  ["submitted", "approved", "moderator"],
  ["submitted", "changes_requested", "moderator"],
  ["submitted", "rejected", "moderator"],
];

export function canTransition(
  from: UserListingStatus,
  to: UserListingStatus,
  actor: ReviewActor,
): boolean {
  return TRANSITIONS.some(([f, t, a]) => f === from && t === to && a === actor);
}

/** Moderator decisions that need a written reason. */
export const REASON_REQUIRED: readonly UserListingStatus[] = ["changes_requested", "rejected"];
export const MAX_REASON_LENGTH = 1000;

/** Badge on the listing preview: the status and that the listing is not public. */
export const PREVIEW_LABEL: Record<UserListingStatus, string> = {
  draft: "დრაფტი · არ არის გამოქვეყნებული",
  submitted: "განხილვაზე · არ არის გამოქვეყნებული",
  changes_requested: "საჭიროა ცვლილება · არ არის გამოქვეყნებული",
  approved: "დამტკიცებულია · ჯერ არ გამოქვეყნებულა",
  rejected: "უარყოფილია · არ ქვეყნდება",
  archived: "წაშლილია · არსად ჩანს",
};

/**
 * How long a moderator's claim on a submitted listing lasts. The database sets the expiry
 * (migration 0006: interval '60 minutes'); a test keeps both values equal.
 */
export const CLAIM_MINUTES = 60;

/** The exact value the browser sends to confirm an administrator self-approval (never implied). */
export const SELF_APPROVAL_CONFIRMATION = "self-approve-own-listing";

/** Editable starting points for a moderator's reason (the text can be changed before sending). */
export const REASON_TEMPLATES: readonly { label: string; text: string }[] = [
  { label: "ბნელი ფოტოები", text: "ფოტოები ბნელი ან ბუნდოვანია. ატვირთეთ უფრო ნათელი ფოტოები." },
  { label: "ფოტო არ შეესაბამება", text: "ზოგიერთი ფოტო არ შეესაბამება აღწერილ ქონებას." },
  { label: "ფასი", text: "ფასი ან ვალუტა სავარაუდოდ შეცდომითაა მითითებული. გადაამოწმეთ." },
  {
    label: "ფართი/ოთახები",
    text: "ფართი ან ოთახების რაოდენობა ერთმანეთს არ ემთხვევა. გადაამოწმეთ.",
  },
  { label: "მდებარეობა", text: "მდებარეობა (ქალაქი ან უბანი) არასრულია ან არასწორია." },
  { label: "სათაური", text: "სათაური არ აღწერს ქონებას ან შეიცავს ზედმეტ ინფორმაციას." },
  {
    label: "წესების დარღვევა",
    text: "განცხადება არღვევს პლატფორმის წესებს და ვერ დამტკიცდება.",
  },
];

export function isUserListingStatus(value: unknown): value is UserListingStatus {
  return (USER_LISTING_STATUSES as readonly unknown[]).includes(value);
}

/** Georgian label and short explanation for the owner. */
export const STATUS_TEXT: Record<UserListingStatus, { label: string; note: string }> = {
  draft: { label: "დრაფტი", note: "პირადია. შეგიძლიათ შეცვალოთ და გაგზავნოთ განსახილველად." },
  submitted: {
    label: "განხილვაზე",
    note: "მოდერატორი განიხილავს. ამ დროს რედაქტირება შეუძლებელია; გადაწყვეტილებამდე შეგიძლიათ გაგზავნის გაუქმება.",
  },
  changes_requested: {
    label: "საჭიროა ცვლილება",
    note: "მოდერატორმა ცვლილება მოითხოვა. შეასწორეთ და ხელახლა გაგზავნეთ.",
  },
  approved: {
    label: "დამტკიცებულია",
    note: "დამტკიცებულია, მაგრამ ჯერ არ გამოქვეყნებულა: გამოქვეყნება მომდევნო ეტაპზე დაემატება.",
  },
  rejected: {
    label: "უარყოფილია",
    note: "გადაწყვეტილება საბოლოოა: ამ განცხადების შეცვლა ან ხელახლა გაგზავნა შეუძლებელია.",
  },
  archived: { label: "წაშლილია", note: "არქივშია და არსად ჩანს." },
};
