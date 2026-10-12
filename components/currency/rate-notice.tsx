import type { ExchangeRateState } from "@/lib/currency/exchange-rate";
import { formatDateGeorgian, formatExchangeRate } from "@/lib/pricing/format-money";

function Chevron() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="h-4 w-4 fill-current transition-transform group-open:rotate-180"
    >
      <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" />
    </svg>
  );
}

/** Longer explanation, shown only when the user opens "დეტალები". */
function RateExplanation() {
  return (
    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-muted">
      <li>ეს არის საქართველოს ეროვნული ბანკის ოფიციალური ორიენტირებული კურსი.</li>
      <li>ბანკების ყიდვისა და გაყიდვის კურსი შეიძლება განსხვავდებოდეს.</li>
      <li>სხვა ვალუტაში გადაყვანილი ფასები სავარაუდოა (≈).</li>
      <li>განცხადების ორიგინალი ფასი და ვალუტა არ იცვლება.</li>
    </ul>
  );
}

/**
 * Compact exchange-rate bar: rate, source (NBG), and effective date on one line, with the longer
 * explanation behind an accessible "დეტალები" disclosure. Problems (unavailable or possibly
 * outdated rate) are always shown outside the disclosure, never hidden in it.
 */
export function RateNotice({ rateState }: { rateState: ExchangeRateState }) {
  if (rateState.status === "unavailable") {
    return (
      <details
        role="note"
        className="group rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
      >
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 [&::-webkit-details-marker]:hidden">
          <span className="font-semibold">გაცვლითი კურსი მიუწვდომელია</span>
          <span>· ნაჩვენებია ორიგინალი ფასები</span>
          <span className="ml-auto inline-flex items-center gap-1 font-medium">
            დეტალები
            <Chevron />
          </span>
        </summary>
        <p className="mt-2 text-xs leading-5">
          საქართველოს ეროვნული ბანკის კურსის მიღება ვერ მოხერხდა, ამიტომ სხვა ვალუტაში გადაყვანილი
          ფასები არ ჩანს და ბიუჯეტი მხოლოდ იმავე ვალუტის განცხადებებს ედრება. კურსი კოდში არ არის
          ჩაწერილი და არ გამოიგონება.
        </p>
      </details>
    );
  }

  const { rate, freshness } = rateState;
  return (
    <div className="text-sm">
      <details className="group rounded-xl border border-line bg-surface px-3 py-2">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 [&::-webkit-details-marker]:hidden">
          <span className="font-semibold text-navy">{formatExchangeRate(rate.gelPerUsd)}</span>
          <span className="text-muted">
            · NBG · მოქმედია {formatDateGeorgian(rate.effectiveDate)}
          </span>
          <span className="ml-auto inline-flex items-center gap-1 font-medium text-accent-700">
            დეტალები
            <Chevron />
          </span>
        </summary>
        <RateExplanation />
      </details>
      {freshness === "possibly-outdated" && (
        <p role="note" className="mt-1 px-1 text-xs leading-5 text-amber-900">
          კურსი შესაძლოა მოძველებული იყოს: მოქმედების თარიღის შემდეგ რამდენიმე სამუშაო დღე გავიდა
          (ეს შეიძლება უქმე დღეებით იყოს გამოწვეული).
        </p>
      )}
    </div>
  );
}
