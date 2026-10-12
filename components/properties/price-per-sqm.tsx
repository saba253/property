/** Compact chip for cards: the asking price per square metre, already formatted. */
export function PricePerSqmChip({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-50 px-2.5 py-1 text-xs font-semibold text-accent-700 ring-1 ring-accent-100">
      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 fill-accent-500">
        <path d="M2 2h5v5H2V2Zm7 0h5v5H9V2ZM2 9h5v5H2V9Zm7 0h5v5H9V9Z" opacity=".9" />
      </svg>
      <span className="sr-only">ფასი მ²-ზე: </span>
      {text}
    </span>
  );
}

/** Highlighted panel for the detail page: our signature decision-support figure. */
export function PricePerSqmCallout({
  title,
  text,
  note,
}: {
  title: string;
  text: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl bg-accent-50 p-4 ring-1 ring-accent-100">
      <p className="text-sm font-medium text-navy">{title}</p>
      <p className="mt-1 text-2xl font-bold text-accent-700">{text}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </div>
  );
}
