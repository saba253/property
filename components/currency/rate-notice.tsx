import type { ExchangeRateState } from "@/lib/currency/exchange-rate";
import { formatDateGeorgian, formatExchangeRate } from "@/lib/pricing/format-money";

/**
 * Explains where converted prices come from: source, rate, effective date, and limits.
 * Shown wherever converted prices appear, so they are never presented without context.
 */
export function RateNotice({ rateState }: { rateState: ExchangeRateState }) {
  if (rateState.status === "unavailable") {
    return (
      <p
        role="note"
        className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"
      >
        <strong className="font-semibold">გაცვლითი კურსი ამჟამად მიუწვდომელია.</strong> საქართველოს
        ეროვნული ბანკის კურსის მიღება ვერ მოხერხდა, ამიტომ სხვა ვალუტაში გადაყვანილი ფასები არ ჩანს.
        ნაჩვენებია განცხადებების ორიგინალი ფასები.
      </p>
    );
  }

  const { rate, freshness } = rateState;
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 text-sm leading-6 text-muted">
      <p>
        <span className="font-semibold text-navy">{formatExchangeRate(rate.gelPerUsd)}</span> ·
        საქართველოს ეროვნული ბანკის ოფიციალური კურსი, მოქმედია{" "}
        {formatDateGeorgian(rate.effectiveDate)}-დან.
      </p>
      <p className="mt-1">
        ეს არის ოფიციალური ორიენტირებული კურსი და არა ბანკების ყიდვა-გაყიდვის კურსი რეალურ დროში.
        გადაყვანილი ფასები სავარაუდოა (≈); ორიგინალი ფასი და ვალუტა ყოველთვის მითითებულია.
      </p>
      {freshness === "possibly-outdated" && (
        <p className="mt-2 font-medium text-amber-900">
          კურსი შესაძლოა მოძველებული იყოს: მოქმედების თარიღის შემდეგ რამდენიმე სამუშაო დღე გავიდა.
          ეს შეიძლება უქმე დღეებით იყოს გამოწვეული.
        </p>
      )}
    </div>
  );
}
