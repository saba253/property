import Form from "next/form";
import Link from "next/link";
import { CityDistrictFields } from "@/components/properties/city-district-fields";
import { card, fieldInput, fieldLabel } from "@/components/ui/styles";
import {
  AMENITIES,
  AMENITY_GROUP_LABELS,
  type AmenityGroup,
  amenityAppliesTo,
} from "@/lib/properties/amenities";
import type { City, DistrictOption } from "@/lib/properties/cities";
import {
  type CountFilterKey,
  MAX_ROOMS_FILTER,
  type NumericFilterKey,
} from "@/lib/properties/listing-filters";
import {
  PROPERTY_TYPES,
  PROPERTY_TYPE_ORDER,
  isPropertyType,
} from "@/lib/properties/listing-types";
import type { SortOption } from "@/lib/properties/listing-sort";
import type { ListingsView } from "@/lib/properties/listings-view";
import type { Currency, PropertyType, TransactionType } from "@/lib/properties/types";

/** Initial values of the form fields, as strings. Empty string means "not set". */
export type ListingFilterFormValues = {
  propertyType: string;
  city: string;
  district: string;
  rooms: string;
  currency: string;
  amenities: readonly string[];
} & Record<NumericFilterKey | CountFilterKey, string>;

type ListingFiltersFormProps = {
  cities: readonly City[];
  /** Districts present in the listing data (for the district select). */
  districts: readonly DistrictOption[];
  values: ListingFilterFormValues;
  /** Currency of the budget fields; kept on submit through a hidden field. */
  display: Currency;
  /** Sale or rent; kept on submit through a hidden field. Changes the budget wording. */
  transaction: TransactionType;
  /** Number of active "more filters"; the section starts open when it is above 0. */
  advancedCount: number;
  showReset: boolean;
  resetHref: string;
  /** Kept on submit, so filtering in the map view stays in the map view. */
  view: ListingsView;
  /** Kept on submit, so changing filters keeps the chosen sort order. */
  sort: SortOption;
};

function NumberInput({
  name,
  accessibleLabel,
  placeholder,
  defaultValue,
  describedBy,
  wholeNumbers = false,
}: {
  name: NumericFilterKey | CountFilterKey;
  accessibleLabel: string;
  placeholder: string;
  defaultValue: string;
  describedBy?: string;
  wholeNumbers?: boolean;
}) {
  return (
    <input
      id={`filter-${name}`}
      name={name}
      type="number"
      inputMode={wholeNumbers ? "numeric" : "decimal"}
      min={0}
      step={wholeNumbers ? 1 : "any"}
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
  wholeNumbers,
  className = "col-span-2 lg:col-span-1",
}: {
  legend: string;
  minName: NumericFilterKey | CountFilterKey;
  maxName: NumericFilterKey | CountFilterKey;
  minLabel: string;
  maxLabel: string;
  values: ListingFilterFormValues;
  describedBy?: string;
  wholeNumbers?: boolean;
  className?: string;
}) {
  return (
    <fieldset className={className}>
      <legend className={fieldLabel}>{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        <NumberInput
          name={minName}
          accessibleLabel={minLabel}
          placeholder="მინ."
          defaultValue={values[minName]}
          describedBy={describedBy}
          wholeNumbers={wholeNumbers}
        />
        <NumberInput
          name={maxName}
          accessibleLabel={maxLabel}
          placeholder="მაქს."
          defaultValue={values[maxName]}
          describedBy={describedBy}
          wholeNumbers={wholeNumbers}
        />
      </div>
    </fieldset>
  );
}

function MinimumSelect({
  name,
  label,
  options,
  defaultValue,
}: {
  name: CountFilterKey;
  label: string;
  options: readonly number[];
  defaultValue: string;
}) {
  return (
    <div>
      <label htmlFor={`filter-${name}`} className={fieldLabel}>
        {label}
      </label>
      <select id={`filter-${name}`} name={name} defaultValue={defaultValue} className={fieldInput}>
        <option value="">ნებისმიერი</option>
        {options.map((value) => (
          <option key={value} value={value}>
            {value}+
          </option>
        ))}
      </select>
    </div>
  );
}

function AmenityFieldset({
  group,
  selected,
  propertyType,
}: {
  group: AmenityGroup;
  selected: ReadonlySet<string>;
  propertyType: PropertyType | null;
}) {
  return (
    <fieldset>
      <legend className={fieldLabel}>{AMENITY_GROUP_LABELS[group]}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {AMENITIES.filter(
          (amenity) =>
            amenity.group === group &&
            (propertyType === null || amenityAppliesTo(amenity, propertyType)),
        ).map((amenity) => (
          <label
            key={amenity.key}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-surface px-3 py-2 text-sm text-ink transition-colors hover:border-navy has-checked:border-navy has-checked:bg-navy has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent-500"
          >
            <input
              type="checkbox"
              name="amenity"
              value={amenity.key}
              defaultChecked={selected.has(amenity.key)}
              className="h-4 w-4 accent-navy"
            />
            {amenity.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ListingFiltersForm({
  cities,
  districts,
  values,
  display,
  transaction,
  advancedCount,
  showReset,
  resetHref,
  view,
  sort,
}: ListingFiltersFormProps) {
  const symbol = display === "USD" ? "$" : "₾";
  const selectedAmenities = new Set(values.amenities);
  const propertyType = isPropertyType(values.propertyType) ? values.propertyType : null;
  // Floor fields only make sense when apartments can be in the results.
  const showFloor = propertyType === null || PROPERTY_TYPES[propertyType].hasFloor;
  const isRent = transaction === "rent";

  return (
    <Form action="/properties" aria-label="განცხადებების ფილტრები" className={`${card} p-4 sm:p-5`}>
      <input type="hidden" name="display" value={display} />
      {isRent && <input type="hidden" name="transaction" value="rent" />}
      {view === "map" && <input type="hidden" name="view" value="map" />}
      {sort !== "default" && <input type="hidden" name="sort" value={sort} />}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1fr_1fr_1.2fr_1.5fr_1.5fr_auto] lg:items-end">
        <div>
          <label htmlFor="filter-type" className={fieldLabel}>
            ქონების ტიპი
          </label>
          <select
            id="filter-type"
            name="type"
            defaultValue={values.propertyType}
            className={fieldInput}
          >
            <option value="">ნებისმიერი</option>
            {PROPERTY_TYPE_ORDER.map((type) => (
              <option key={type} value={type}>
                {PROPERTY_TYPES[type].label}
              </option>
            ))}
          </select>
        </div>

        <CityDistrictFields
          cities={cities}
          districts={districts}
          defaultCity={values.city}
          defaultDistrict={values.district}
        />

        <RangeFieldset
          legend={isRent ? `ქირა თვეში (${symbol} ${display})` : `ბიუჯეტი (${symbol} ${display})`}
          minName="minPrice"
          maxName="maxPrice"
          minLabel={
            isRent ? `მინიმალური თვიური ქირა, ${display}` : `მინიმალური ბიუჯეტი, ${display}`
          }
          maxLabel={
            isRent ? `მაქსიმალური თვიური ქირა, ${display}` : `მაქსიმალური ბიუჯეტი, ${display}`
          }
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

      {/* Native <details>: works without JavaScript and is keyboard accessible by default. */}
      <details open={advancedCount > 0} className="group mt-4 border-t border-line pt-3">
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-full py-1 text-sm font-semibold text-navy [&::-webkit-details-marker]:hidden">
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className="h-4 w-4 fill-current transition-transform group-open:rotate-180"
          >
            <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" />
          </svg>
          მეტი ფილტრი
          {advancedCount > 0 && (
            <span className="rounded-full bg-navy px-2 py-0.5 text-xs text-white">
              {advancedCount}
              <span className="sr-only"> აქტიური</span>
            </span>
          )}
        </summary>

        <div className="mt-4 space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="col-span-2 lg:col-span-1">
              <label htmlFor="filter-currency" className={fieldLabel}>
                ორიგინალი ვალუტა
              </label>
              <select
                id="filter-currency"
                name="currency"
                defaultValue={values.currency}
                aria-describedby="filter-currency-hint"
                className={fieldInput}
              >
                <option value="">ნებისმიერი</option>
                <option value="USD">USD ($)</option>
                <option value="GEL">GEL (₾)</option>
              </select>
            </div>
            <div className="col-span-2 lg:col-span-1">
              <label htmlFor="filter-rooms" className={fieldLabel}>
                ოთახები
              </label>
              <select
                id="filter-rooms"
                name="rooms"
                defaultValue={values.rooms}
                className={fieldInput}
              >
                <option value="">ნებისმიერი</option>
                {Array.from({ length: MAX_ROOMS_FILTER }, (_, index) => index + 1).map((rooms) => (
                  <option key={rooms} value={rooms}>
                    {rooms === MAX_ROOMS_FILTER ? `${rooms}+` : rooms}
                  </option>
                ))}
              </select>
            </div>
            <MinimumSelect
              name="minBedrooms"
              label="საძინებელი (მინ.)"
              options={[1, 2, 3, 4]}
              defaultValue={values.minBedrooms}
            />
            <MinimumSelect
              name="minBathrooms"
              label="სველი წერტილი (მინ.)"
              options={[1, 2, 3]}
              defaultValue={values.minBathrooms}
            />
            {showFloor && (
              <RangeFieldset
                legend={propertyType === null ? "სართული (მხოლოდ ბინები)" : "სართული"}
                minName="minFloor"
                maxName="maxFloor"
                minLabel="მინიმალური სართული"
                maxLabel="მაქსიმალური სართული"
                values={values}
                wholeNumbers
                className="col-span-2"
              />
            )}
          </div>

          <AmenityFieldset
            group="property"
            selected={selectedAmenities}
            propertyType={propertyType}
          />
          <AmenityFieldset
            group="listing"
            selected={selectedAmenities}
            propertyType={propertyType}
          />

          <p className="text-xs leading-5 text-muted">
            რამდენიმე არჩეული კეთილმოწყობის შემთხვევაში ნაჩვენებია მხოლოდ ის განცხადებები, სადაც
            ყველა მათგანი დადასტურებულია. განცხადებები, სადაც ინფორმაცია არ არის მითითებული, ამ
            ფილტრით არ ჩანს.
          </p>
        </div>
      </details>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1 text-xs leading-5 text-muted">
          <p id="filter-price-hint">
            {isRent ? "თვიური ქირა" : "ბიუჯეტი"} {display}-ში · სხვა ვალუტის განცხადებები NBG-ის
            კურსით შედარდება.
          </p>
          <p id="filter-currency-hint" className="sr-only">
            „ორიგინალი ვალუტა“ აჩვენებს მხოლოდ იმ განცხადებებს, რომელთა ფასი თავიდანვე ამ ვალუტაშია.
          </p>
        </div>
        {showReset && (
          <Link
            href={resetHref}
            className="shrink-0 text-sm font-semibold text-accent-700 underline-offset-4 hover:underline"
          >
            ფილტრების გასუფთავება
          </Link>
        )}
      </div>
    </Form>
  );
}
