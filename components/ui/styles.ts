/** Shared Tailwind class names, so buttons and fields look the same on every page. */

const buttonBase =
  "inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 text-base font-medium transition-colors";

export const buttonPrimary = `${buttonBase} bg-navy text-white hover:bg-navy-900`;

export const buttonSecondary = `${buttonBase} border border-line-strong bg-surface text-navy hover:border-navy`;

export const fieldLabel = "block text-xs font-semibold text-muted";

export const fieldInput =
  "mt-1 block h-11 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink transition-colors hover:border-line-strong";

export const card = "rounded-card border border-line bg-surface shadow-card";

export const pageContainer = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";
