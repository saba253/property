import Form from "next/form";
import Link from "next/link";
import { card, fieldInput, fieldLabel } from "@/components/ui/styles";
import type { City } from "@/lib/properties/cities";
import type { NumericFilterKey } from "@/lib/properties/listing-filters";

/** Initial values of the form fields, as strings. Empty string means "not set". */
export type ListingFilterFormValues = {
  city: string;
  currency: string;
} & Record<NumericFilterKey, string>;

type ListingFiltersFormProps = {
  cities: readonly City[];
  values: ListingFilterFormValues;
  showReset: boolean;
};

function NumberInput({
  name,
  accessibleLabel,
  placeholder,
  defaultValue,
  describedBy,
}: {
  name: NumericFilterKey;
  accessibleLabel: string;
  placeholder: string;
  defaultValue: string;
  describedBy?: string;
}) {
  return (
    <input
      id={`filter-${name}`}
      name={name}
      type="number"
      inputMode="decimal"
      min={0}
      step="any"
      placeholder={placeholder}
      aria-label={accessibleLabel}
      defaultValue={defaultValue}
      aria-describedby={describedBy}
      className={fieldInput}
    />
  );
}

function RangeFieldset({
  legend,
  minName,
  maxName,
  minLabel,
  maxLabel,
  values,
  describedBy,
}: {
  legend: string;
  minName: NumericFilterKey;
  maxName: NumericFilterKey;
  minLabel: string;
  maxLabel: string;
  values: ListingFilterFormValues;
  describedBy?: string;
}) {
  return (
    <fieldset className="col-span-2 lg:col-span-1">
      <legend className={fieldLabel}>{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        <NumberInput
          name={minName}
          accessibleLabel={minLabel}
          placeholder="მინ."
          defaultValue={values[minName]}
          describedBy={describedBy}
        />
        <NumberInput
          name={maxName}
          accessibleLabel={maxLabel}
          placeholder="მაქს."
          defaultValue={values[maxName]}
          describedBy={describedBy}
        />
      </div>
    </fieldset>
  );
}

export function ListingFiltersForm({ cities, values, showReset }: ListingFiltersFormProps) {
  return (
    <Form action="/properties" aria-label="განცხადებების ფილტრები" className={`${card} p-4 sm:p-5`}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1fr_1fr_1.6fr_1.6fr_auto] lg:items-end">
        <div>
          <label htmlFor="filter-city" className={fieldLabel}>
            ქალაქი
          </label>
          <select id="filter-city" name="city" defaultValue={values.city} className={fieldInput}>
            <option value="">ყველა</option>
            {cities.map((city) => (
              <option key={city.slug} value={city.slug}>
                {city.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filter-currency" className={fieldLabel}>
            ვალუტა
          </label>
          <select
            id="filter-currency"
            name="currency"
            defaultValue={values.currency}
            aria-describedby="filter-price-hint"
            className={fieldInput}
          >
            <option value="">ყველა</option>
            <option value="USD">USD ($)</option>
            <option value="GEL">GEL (₾)</option>
          </select>
        </div>

        <RangeFieldset
          legend="მითითებული ფასი"
          minName="minPrice"
          maxName="maxPrice"
          minLabel="მინიმალური ფასი"
          maxLabel="მაქსიმალური ფასი"
          values={values}
          describedBy="filter-price-hint"
        />

        <RangeFieldset
          legend="ფართი (მ²)"
          minName="minArea"
          maxName="maxArea"
          minLabel="მინიმალური ფართი, მ²"
          maxLabel="მაქსიმალური ფართი, მ²"
          values={values}
        />

        <button
          type="submit"
          className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-navy px-5 text-base font-semibold text-white transition-colors hover:bg-navy-900 lg:col-span-1"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5 fill-current">
            <path d="M8.5 2a6.5 6.5 0 0 1 5.18 10.43l3.95 3.94a1 1 0 0 1-1.42 1.42l-3.94-3.95A6.5 6.5 0 1 1 8.5 2Zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z" />
          </svg>
          ძიება
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <p id="filter-price-hint" className="text-xs leading-5 text-muted">
          ფასით ფილტრაციისთვის აირჩიეთ ვალუტა. USD და GEL ფასები ერთმანეთს არ ედრება და არ
          კონვერტირდება.
        </p>
        {showReset && (
          <Link
            href="/properties"
            className="shrink-0 text-sm font-semibold text-accent-700 underline-offset-4 hover:underline"
          >
            ფილტრების გასუფთავება
          </Link>
        )}
      </div>
    </Form>
  );
}
