export type Fact = {
  label: string;
  value: string;
};

/** Property facts as a two-column grid of label/value pairs. */
export function FactList({ facts }: { facts: readonly Fact[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
      {facts.map((fact) => (
        <div key={fact.label} className="bg-surface p-4">
          <dt className="text-xs font-medium text-muted">{fact.label}</dt>
          <dd className="mt-1 text-base font-semibold text-ink">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
