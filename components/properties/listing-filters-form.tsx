import Form from "next/form";
import Link from "next/link";
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
};

const inputClassName =
  "mt-1 block h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900";

const labelClassName = "block text-sm font-medium text-slate-700";

function NumberField({
  name,
  label,
  defaultValue,
  describedBy,
}: {
  name: NumericFilterKey;
  label: string;
  defaultValue: string;
  describedBy?: string;
}) {
  return (
    <div>
      <label htmlFor={`filter-${name}`} className={labelClassName}>
        {label}
      </label>
      <input
        id={`filter-${name}`}
        name={name}
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        defaultValue={defaultValue}
        aria-describedby={describedBy}
        className={inputClassName}
      />
    </div>
  );
}

export function ListingFiltersForm({ cities, values }: ListingFiltersFormProps) {
  return (
    <Form
      action="/properties"
      aria-label="განცხადებების ფილტრები"
      className="rounded-2xl border border-slate-200 bg-white p-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="filter-city" className={labelClassName}>
            ქალაქი
          </label>
          <select
            id="filter-city"
            name="city"
            defaultValue={values.city}
            className={inputClassName}
          >
            <option value="">ყველა ქალაქი</option>
            {cities.map((city) => (
              <option key={city.slug} value={city.slug}>
                {city.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filter-currency" className={labelClassName}>
            ვალუტა
          </label>
          <select
            id="filter-currency"
            name="currency"
            defaultValue={values.currency}
            aria-describedby="filter-price-hint"
            className={inputClassName}
          >
            <option value="">ყველა ვალუტა</option>
            <option value="USD">USD ($)</option>
            <option value="GEL">GEL (₾)</option>
          </select>
        </div>
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold text-slate-900">მითითებული ფასი</legend>
        <p id="filter-price-hint" className="mt-1 text-xs leading-5 text-slate-500">
          ფასით ფილტრაციისთვის აირჩიეთ ვალუტა. USD და GEL ფასები ერთმანეთს არ ედრება და არ
          კონვერტირდება.
        </p>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <NumberField
            name="minPrice"
            label="მინიმუმი"
            defaultValue={values.minPrice}
            describedBy="filter-price-hint"
          />
          <NumberField
            name="maxPrice"
            label="მაქსიმუმი"
            defaultValue={values.maxPrice}
            describedBy="filter-price-hint"
          />
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold text-slate-900">ფართი (მ²)</legend>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <NumberField name="minArea" label="მინიმუმი" defaultValue={values.minArea} />
          <NumberField name="maxArea" label="მაქსიმუმი" defaultValue={values.maxArea} />
        </div>
      </fieldset>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          className="inline-flex h-11 items-center justify-center rounded-full bg-slate-900 px-6 text-base font-medium text-white transition-colors hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          ფილტრის გამოყენება
        </button>
        <Link
          href="/properties"
          className="inline-flex h-11 items-center justify-center rounded-full border border-slate-300 px-6 text-base font-medium text-slate-700 transition-colors hover:border-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          ფილტრების გასუფთავება
        </Link>
      </div>
    </Form>
  );
}
