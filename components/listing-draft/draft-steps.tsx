"use client";

import { type Dispatch, type DragEvent, useState } from "react";
import {
  ChoiceCards,
  FieldError,
  Segmented,
  TextField,
  describedBy,
  fieldId,
  inputClass,
} from "@/components/listing-draft/draft-fields";
import { fieldLabel } from "@/components/ui/styles";
import { type ExchangeRateState } from "@/lib/currency/exchange-rate";
import {
  ACCEPTED_PHOTO_EXTENSIONS,
  ACCEPTED_PHOTO_TYPES,
  MAX_DRAFT_PHOTOS,
  describePhotoRejection,
  formatFileSize,
  type PhotoRejection,
} from "@/lib/listing-draft/draft-photos";
import {
  MAX_PHOTO_ALT_LENGTH,
  MAX_TITLE_LENGTH,
  PRICE_LIMITS,
  type DraftTextField,
  detailFieldLabel,
  getDetailFields,
  getDraftTopFloorStatus,
  getEditableAmenities,
  readDraftNumber,
  readDraftPrice,
  suggestDraftTitle,
} from "@/lib/listing-draft/draft";
import type { DraftAction, DraftState } from "@/lib/listing-draft/draft-state";
import { getDisplayPrice } from "@/lib/pricing/display-price";
import { formatDisplayAmount, formatDisplayPricePerSqm } from "@/lib/pricing/format-display-price";
import { AMENITY_GROUP_LABELS, type AmenityGroup } from "@/lib/properties/amenities";
import { type DistrictOption, knownCities } from "@/lib/properties/cities";
import { PROPERTY_TYPES, PROPERTY_TYPE_ORDER } from "@/lib/properties/listing-types";
import type {
  AmenityStatus,
  Currency,
  PropertyType,
  TransactionType,
} from "@/lib/properties/types";

export type StepProps = {
  state: DraftState;
  dispatch: Dispatch<DraftAction>;
};

function useField(state: DraftState, dispatch: Dispatch<DraftAction>) {
  return (field: DraftTextField) => ({
    field,
    value: state.draft[field],
    error: state.errors[field],
    onChange: (value: string) => dispatch({ type: "set-field", field, value }),
  });
}

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-current">
      <path d={path} />
    </svg>
  );
}

const ICONS = {
  sale: "M12 2.5 3 8v13h7v-6h4v6h7V8l-9-5.5Zm0 2.3 7 4.3V19h-3v-6H8v6H5V9.1l7-4.3Z",
  rent: "M7.5 10a4.5 4.5 0 1 1 4.24 4.5H10.5V16h-2v2h-2v2.5H3V17l4.7-4.7A4.5 4.5 0 0 1 7.5 10Zm4.5-2.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
  apartment:
    "M5 2h10v6h4v14H5V2Zm2 2v16h3v-3h4v3h3V10h-4V4H7Zm1 2h2v2H8V6Zm3 0h2v2h-2V6ZM8 9h2v2H8V9Zm3 0h2v2h-2V9Zm-3 3h2v2H8v-2Zm3 0h2v2h-2v-2Zm4 0h2v2h-2v-2Z",
  house: "M12 3 2 11h3v10h6v-6h2v6h6V11h3L12 3Zm0 2.6 5 4V19h-2v-6H9v6H7V9.6l5-4Z",
} as const;

export function TransactionStep({ state, dispatch }: StepProps) {
  return (
    <ChoiceCards<TransactionType>
      field="transactionType"
      legend="გარიგების ტიპი"
      name="transactionType"
      value={state.draft.transactionType}
      onChange={(value) => dispatch({ type: "set-transaction", value })}
      error={state.errors.transactionType}
      options={[
        {
          value: "sale",
          label: "იყიდება",
          description: "ქონების გაყიდვა. მიუთითებთ სრულ გასაყიდ ფასს.",
          icon: <Icon path={ICONS.sale} />,
        },
        {
          value: "rent",
          label: "ქირავდება",
          description: "გრძელვადიანი ქირა. ფასი მიეთითება თვეში.",
          icon: <Icon path={ICONS.rent} />,
        },
      ]}
    />
  );
}

const PROPERTY_TYPE_TEXT: Record<PropertyType, string> = {
  apartment: "ბინა მრავალბინიან კორპუსში: სართული, ლიფტი, აივანი.",
  house: "ცალკე მდგომი სახლი: სართულიანობა, ეზოს ფართი.",
};

export function PropertyTypeStep({ state, dispatch }: StepProps) {
  return (
    <>
      <ChoiceCards<PropertyType>
        field="propertyType"
        legend="ქონების ტიპი"
        name="propertyType"
        value={state.draft.propertyType}
        onChange={(value) => dispatch({ type: "set-property-type", value })}
        error={state.errors.propertyType}
        options={PROPERTY_TYPE_ORDER.map((type) => ({
          value: type,
          label: PROPERTY_TYPES[type].label,
          description: PROPERTY_TYPE_TEXT[type],
          icon: <Icon path={ICONS[type]} />,
        }))}
      />
      <p className="mt-4 text-sm text-muted">
        ფორმაში მხოლოდ არჩეული ტიპისთვის შესაბამისი ველები გამოჩნდება. ტიპის შეცვლისას უკვე
        შეყვანილი, მაგრამ შეუსაბამო მონაცემები გადახედვაში არ გამოჩნდება.
      </p>
    </>
  );
}

export function LocationStep({
  state,
  dispatch,
  districts,
}: StepProps & { districts: readonly DistrictOption[] }) {
  const field = useField(state, dispatch);
  const city = knownCities.find((item) => item.slug === state.draft.citySlug);
  const suggestions = districts.filter((district) => district.city === city?.name);
  const cityError = state.errors.citySlug;

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div>
        <label htmlFor={fieldId("citySlug")} className={fieldLabel}>
          ქალაქი<span className="text-red-700"> *</span>
        </label>
        <select
          id={fieldId("citySlug")}
          value={state.draft.citySlug}
          onChange={(event) =>
            dispatch({ type: "set-field", field: "citySlug", value: event.target.value })
          }
          required
          {...describedBy("citySlug", cityError, "hint")}
          className={inputClass(cityError)}
        >
          <option value="">აირჩიეთ ქალაქი</option>
          {knownCities.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
        <p id="draft-citySlug-hint" className="mt-1 text-xs text-subtle">
          ამ ეტაპზე ხელმისაწვდომია თბილისი და ბათუმი.
        </p>
        <FieldError field="citySlug" message={cityError} />
      </div>

      <div>
        <TextField
          {...field("district")}
          label="უბანი"
          required
          placeholder={suggestions[0] ? `მაგ. ${suggestions[0].name}` : "მაგ. ვაკე"}
          hint="ზუსტი მისამართი საჭირო არ არის. რუქაზე ნაჩვენები იქნება მხოლოდ უბნის მიახლოებითი მდებარეობა, თუ უბანი ცნობილია."
          maxLength={60}
          list={suggestions.length > 0 ? "draft-district-suggestions" : undefined}
        />
        {suggestions.length > 0 && (
          <datalist id="draft-district-suggestions">
            {suggestions.map((district) => (
              <option key={district.name} value={district.name} />
            ))}
          </datalist>
        )}
      </div>
    </div>
  );
}

export function DetailsStep({ state, dispatch }: StepProps) {
  const field = useField(state, dispatch);
  const type = state.draft.propertyType;
  if (!type) {
    return <p className="text-muted">ჯერ აირჩიეთ ქონების ტიპი.</p>;
  }

  return (
    <>
      <p className="mb-5 text-sm text-muted">
        <span className="text-red-700">*</span> სავალდებულოა მხოლოდ ფართი. ცარიელი ველები
        გადახედვაში გამოჩნდება როგორც „არ არის მითითებული“.
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        {getDetailFields(type).map((spec) => (
          <TextField
            key={spec.field}
            {...field(spec.field)}
            label={detailFieldLabel(spec, type)}
            required={spec.required}
            hint={spec.hint}
            inputMode={spec.integer && spec.min >= 0 ? "numeric" : "decimal"}
          />
        ))}
      </div>
    </>
  );
}

const STATUS_OPTIONS: readonly { value: AmenityStatus; label: string }[] = [
  { value: "yes", label: "არის" },
  { value: "no", label: "არ არის" },
  { value: "unknown", label: "უცნობია" },
];

const TOP_FLOOR_TEXT: Record<AmenityStatus, string> = {
  yes: "დიახ — სართული ემთხვევა კორპუსის სართულიანობას.",
  no: "არა — სართული კორპუსის სართულიანობაზე ნაკლებია.",
  unknown: "უცნობია — მიუთითეთ სართული და კორპუსის სართულიანობა.",
};

export function AmenitiesStep({ state, dispatch }: StepProps) {
  const type = state.draft.propertyType;
  if (!type) {
    return <p className="text-muted">ჯერ აირჩიეთ ქონების ტიპი.</p>;
  }
  const amenities = getEditableAmenities(type);
  const groups: AmenityGroup[] = ["property", "listing"];

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted">
        „უცნობია“ ნიშნავს, რომ ინფორმაცია არ არის მითითებული. ის არ ნიშნავს „არ არის“-ს.
      </p>
      {groups.map((group) => (
        <section key={group} aria-labelledby={`amenity-group-${group}`}>
          <h3 id={`amenity-group-${group}`} className="text-sm font-semibold text-navy">
            {AMENITY_GROUP_LABELS[group]}
          </h3>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
            {amenities
              .filter((amenity) => amenity.group === group)
              .map((amenity) => {
                const key = amenity.key as keyof typeof state.draft.amenities;
                return (
                  <li
                    key={amenity.key}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
                  >
                    <span id={`amenity-${amenity.key}-label`} className="text-ink">
                      {amenity.label}
                    </span>
                    <Segmented<AmenityStatus>
                      legend={amenity.label}
                      hideLegend
                      name={`amenity-${amenity.key}`}
                      options={STATUS_OPTIONS}
                      value={state.draft.amenities[key] ?? "unknown"}
                      onChange={(status) => dispatch({ type: "set-amenity", key, status })}
                    />
                  </li>
                );
              })}
            {group === "property" && type === "apartment" && (
              <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-cream/60 px-4 py-3">
                <span className="text-ink">ბოლო სართული</span>
                <span className="text-sm text-muted">
                  ავტომატურად: {TOP_FLOOR_TEXT[getDraftTopFloorStatus(state.draft)]}
                </span>
              </li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

const CURRENCY_OPTIONS: readonly { value: Currency; label: string }[] = [
  { value: "USD", label: "$ USD" },
  { value: "GEL", label: "₾ GEL" },
];

export function PriceStep({
  state,
  dispatch,
  rateState,
}: StepProps & { rateState: ExchangeRateState }) {
  const field = useField(state, dispatch);
  const { draft } = state;
  const transaction = draft.transactionType ?? "sale";
  const isRent = transaction === "rent";
  const limits = PRICE_LIMITS[transaction];

  // Live calculation with the same pricing code as published listings (USD display default).
  const price = readDraftPrice(draft);
  const area = readDraftNumber(draft, "areaSqm");
  const display =
    price !== null && area !== undefined
      ? getDisplayPrice(
          { amount: price, currency: draft.currency },
          area,
          "USD",
          rateState,
          isRent ? "month" : null,
        )
      : null;
  const perSqm = display ? formatDisplayPricePerSqm(display) : null;

  return (
    <div className="space-y-6">
      <Segmented<Currency>
        legend="ფასის ორიგინალი ვალუტა"
        name="currency"
        options={CURRENCY_OPTIONS}
        value={draft.currency}
        onChange={(value) => dispatch({ type: "set-currency", value })}
      />

      <div className="max-w-md">
        <TextField
          {...field("price")}
          label={isRent ? "თვიური ქირა" : "გასაყიდი ფასი"}
          required
          inputMode="numeric"
          prefix={draft.currency === "USD" ? "$" : "₾"}
          suffix={isRent ? "/ თვე" : undefined}
          placeholder={isRent ? "მაგ. 900" : "მაგ. 150000"}
          hint={
            isRent
              ? `ქირა ერთი თვისთვის, მთელ რიცხვად (${limits.min.toLocaleString("en-US")}–${limits.max.toLocaleString("en-US")}).`
              : `სრული ფასი, მთელ რიცხვად (${limits.min.toLocaleString("en-US")}–${limits.max.toLocaleString("en-US")}).`
          }
        />
      </div>

      <div className="rounded-2xl bg-accent-50 p-4 text-sm ring-1 ring-accent-100">
        {display && perSqm ? (
          <>
            <p className="font-medium text-navy">
              {isRent ? "ქირა კვადრატულ მეტრზე" : "ფასი კვადრატულ მეტრზე"}:{" "}
              <span className="font-bold text-accent-700">{perSqm}</span>
            </p>
            {display.isConverted && (
              <p className="mt-1 text-muted">
                USD-ში ჩვენებისას: {formatDisplayAmount(display)} (NBG-ის ოფიციალური კურსით,
                სავარაუდოდ).
              </p>
            )}
          </>
        ) : (
          <p className="text-muted">
            ფასის შეყვანის შემდეგ აქ ავტომატურად გამოჩნდება ფასი კვადრატულ მეტრზე.
          </p>
        )}
        <p className="mt-2 text-xs text-muted">
          ფასი ინახება იმ ვალუტაში, რომელშიც მიუთითებთ, და არ გადაიყვანება. სხვა ვალუტაში ნაჩვენები
          ფასი მხოლოდ სავარაუდოა.
        </p>
      </div>

      <TextField
        {...field("title")}
        label="განცხადების სათაური"
        placeholder={suggestDraftTitle(draft)}
        maxLength={MAX_TITLE_LENGTH}
        hint={`ცარიელის შემთხვევაში გამოიყენება: „${suggestDraftTitle(draft)}“. მაქს. ${MAX_TITLE_LENGTH} სიმბოლო.`}
      />
    </div>
  );
}

type PhotosStepProps = StepProps & {
  onAddFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  rejections: readonly PhotoRejection[];
};

export function PhotosStep({ state, dispatch, onAddFiles, onRemove, rejections }: PhotosStepProps) {
  const [dragging, setDragging] = useState(false);
  const { photos } = state.draft;
  const full = photos.length >= MAX_DRAFT_PHOTOS;

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (!full) onAddFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div className="space-y-5">
      <div
        role="note"
        className="rounded-2xl border border-line bg-cream px-4 py-3 text-sm leading-6 text-navy"
      >
        ფოტოები მხოლოდ თქვენს ბრაუზერში ჩანს, გადახედვისთვის. ისინი სერვერზე არ იტვირთება და არსად
        ინახება. ეს ნაბიჯი არასავალდებულოა.
      </div>

      <label
        onDragOver={(event) => {
          event.preventDefault();
          if (!full) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center gap-2 rounded-card border-2 border-dashed px-6 py-8 text-center transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent-500 ${
          full
            ? "cursor-not-allowed border-line bg-surface opacity-60"
            : dragging
              ? "cursor-pointer border-accent-500 bg-accent-50"
              : "cursor-pointer border-line-strong bg-surface hover:border-navy"
        }`}
      >
        <svg
          viewBox="0 0 48 48"
          aria-hidden="true"
          className="h-10 w-10 fill-none stroke-sand-500"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="6" y="10" width="36" height="28" rx="5" />
          <circle cx="17" cy="20" r="3.5" />
          <path d="m8 34 10-9 7 6 6-5 9 8" />
        </svg>
        <span className="text-base font-semibold text-navy">
          {full ? "ფოტოების ლიმიტი შევსებულია" : "აირჩიეთ ან ჩააგდეთ ფოტოები"}
        </span>
        <span className="text-sm text-muted">
          JPG, PNG ან WebP · თითო 10 მბ-მდე · მაქსიმუმ {MAX_DRAFT_PHOTOS} ფოტო
        </span>
        <input
          id={fieldId("photos")}
          type="file"
          multiple
          disabled={full}
          accept={`${ACCEPTED_PHOTO_TYPES.join(",")},${ACCEPTED_PHOTO_EXTENSIONS}`}
          onChange={(event) => {
            onAddFiles(Array.from(event.target.files ?? []));
            // Allow choosing the same file again after removing it.
            event.target.value = "";
          }}
          className="sr-only"
        />
      </label>

      {rejections.length > 0 && (
        <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-900">ზოგიერთი ფაილი არ დაემატა:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-900">
            {rejections.map((rejection, index) => (
              <li key={`${rejection.name}-${index}`}>{describePhotoRejection(rejection)}</li>
            ))}
          </ul>
        </div>
      )}
      <FieldError field="photos" message={state.errors.photos} />

      {photos.length > 0 && (
        <>
          <p className="text-sm text-muted" aria-live="polite">
            არჩეულია {photos.length} / {MAX_DRAFT_PHOTOS} ფოტო. პირველი ფოტო მთავარია (ყდა).
          </p>
          <ul className="grid gap-4 sm:grid-cols-2">
            {photos.map((photo, index) => (
              <li
                key={photo.id}
                className="overflow-hidden rounded-2xl border border-line bg-surface"
              >
                <div className="relative aspect-[4/3] bg-cream">
                  {/* Local object URL preview; never uploaded. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.alt.trim() || `განცხადების ფოტო ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  {index === 0 && (
                    <span className="absolute top-3 left-3 rounded-full bg-navy px-2.5 py-1 text-xs font-semibold text-white">
                      მთავარი ფოტო
                    </span>
                  )}
                  <span className="absolute right-3 bottom-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-ink">
                    {index + 1} / {photos.length}
                  </span>
                </div>
                <div className="space-y-3 p-3">
                  <p className="truncate text-xs text-subtle" title={photo.fileName}>
                    {photo.fileName} · {formatFileSize(photo.sizeBytes)}
                  </p>
                  <div>
                    <label htmlFor={`photo-alt-${photo.id}`} className={fieldLabel}>
                      ფოტოს აღწერა <span className="font-normal text-subtle">(არასავალდებულო)</span>
                    </label>
                    <input
                      id={`photo-alt-${photo.id}`}
                      type="text"
                      value={photo.alt}
                      maxLength={MAX_PHOTO_ALT_LENGTH}
                      placeholder="მაგ. მისაღები ოთახი აივნით"
                      onChange={(event) =>
                        dispatch({ type: "set-photo-alt", id: photo.id, alt: event.target.value })
                      }
                      className={inputClass(undefined, "h-10 text-sm")}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <PhotoButton
                      label="მარცხნივ"
                      srLabel={`მარცხნივ გადატანა: ფოტო ${index + 1}`}
                      disabled={index === 0}
                      onClick={() => dispatch({ type: "move-photo", id: photo.id, delta: -1 })}
                    />
                    <PhotoButton
                      label="მარჯვნივ"
                      srLabel={`მარჯვნივ გადატანა: ფოტო ${index + 1}`}
                      disabled={index === photos.length - 1}
                      onClick={() => dispatch({ type: "move-photo", id: photo.id, delta: 1 })}
                    />
                    {index > 0 && (
                      <PhotoButton
                        label="მთავარად"
                        srLabel={`მთავარად დაყენება: ფოტო ${index + 1}`}
                        onClick={() => dispatch({ type: "make-cover", id: photo.id })}
                      />
                    )}
                    <PhotoButton
                      label="წაშლა"
                      srLabel={`წაშლა: ფოტო ${index + 1}`}
                      danger
                      onClick={() => onRemove(photo.id)}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function PhotoButton({
  label,
  srLabel,
  onClick,
  disabled = false,
  danger = false,
}: {
  label: string;
  srLabel: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={srLabel}
      className={`inline-flex h-9 items-center rounded-full border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? "border-red-200 text-red-700 hover:border-red-600"
          : "border-line-strong text-navy hover:border-navy"
      }`}
    >
      {label}
    </button>
  );
}
