export type Fact = {
  label: string;
  /** null means the listing does not state it; shown as "not specified", never guessed. */
  value: string | null;
};

/**
 * Property facts as a grid of separate label/value cells. Separate cells keep the grid tidy for
 * any number of facts (apartments and houses have different fact lists).
 */
export function FactList({ facts }: { facts: readonly Fact[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {facts.map((fact) => (
        <div key={fact.label} className="rounded-xl border border-line bg-surface p-4">
          <dt className="text-xs font-medium text-muted">{fact.label}</dt>
          {fact.value === null ? (
            <dd className="mt-1 text-sm text-subtle">არ არის მითითებული</dd>
          ) : (
            <dd className="mt-1 text-base font-semibold text-ink">{fact.value}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}
