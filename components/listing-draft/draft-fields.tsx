import type { ReactNode } from "react";
import { fieldLabel, fieldInput } from "@/components/ui/styles";
import type { DraftField } from "@/lib/listing-draft/draft";

/** Stable element ids, so the error summary can move focus to a field. */
export const fieldId = (field: DraftField) => `draft-${field}`;
export const errorId = (field: DraftField) => `draft-${field}-error`;
export const hintId = (field: DraftField) => `draft-${field}-hint`;

/** aria attributes connecting a control with its hint and error message. */
export function describedBy(field: DraftField, error?: string, hint?: string) {
  const ids = [hint ? hintId(field) : null, error ? errorId(field) : null].filter(Boolean);
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": ids.length > 0 ? ids.join(" ") : undefined,
  } as const;
}

export function FieldError({ field, message }: { field: DraftField; message?: string }) {
  if (!message) return null;
  return (
    <p id={errorId(field)} className="mt-1.5 flex items-start gap-1.5 text-sm text-red-700">
      <svg viewBox="0 0 20 20" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 fill-current">
        <path d="M10 1.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm0 4a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-4a1 1 0 0 1 1-1Zm0 7.25a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z" />
      </svg>
      {message}
    </p>
  );
}

/** Input classes with a red border when the field has an error. */
export function inputClass(error?: string, extra = "") {
  return `${fieldInput} ${error ? "border-red-600 hover:border-red-700" : ""} ${extra}`;
}

type TextFieldProps = {
  field: DraftField;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  inputMode?: "decimal" | "numeric" | "text";
  placeholder?: string;
  maxLength?: number;
  list?: string;
  /** Text shown inside the field on the right, for example "მ²" or "/ თვე". */
  suffix?: string;
  prefix?: string;
};

/** Labelled text or number field with an optional hint and an error message. */
export function TextField({
  field,
  label,
  value,
  onChange,
  error,
  hint,
  required = false,
  inputMode = "text",
  placeholder,
  maxLength,
  list,
  suffix,
  prefix,
}: TextFieldProps) {
  return (
    <div>
      <label htmlFor={fieldId(field)} className={fieldLabel}>
        {label}
        {required ? (
          <span className="text-red-700"> *</span>
        ) : (
          <span className="font-normal text-subtle"> (არასავალდებულო)</span>
        )}
      </label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute top-1/2 left-3 mt-0.5 -translate-y-1/2 text-base text-muted">
            {prefix}
          </span>
        )}
        <input
          id={fieldId(field)}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          list={list}
          required={required}
          {...describedBy(field, error, hint)}
          className={inputClass(error, `${prefix ? "pl-8" : ""} ${suffix ? "pr-16" : ""}`)}
        />
        {suffix && (
          <span className="pointer-events-none absolute top-1/2 right-3 mt-0.5 -translate-y-1/2 text-sm text-muted">
            {suffix}
          </span>
        )}
      </div>
      {hint && (
        <p id={hintId(field)} className="mt-1 text-xs text-subtle">
          {hint}
        </p>
      )}
      <FieldError field={field} message={error} />
    </div>
  );
}

export type ChoiceOption<T extends string> = {
  value: T;
  label: string;
  description: string;
  icon?: ReactNode;
};

type ChoiceCardsProps<T extends string> = {
  field: DraftField;
  legend: string;
  name: string;
  options: readonly ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string;
};

/** Large radio cards for one required choice (keyboard: Tab to the group, arrows to choose). */
export function ChoiceCards<T extends string>({
  field,
  legend,
  name,
  options,
  value,
  onChange,
  error,
}: ChoiceCardsProps<T>) {
  return (
    <fieldset {...describedBy(field, error)}>
      <legend className="sr-only">{legend}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option, index) => (
          <label
            key={option.value}
            className={`flex cursor-pointer gap-4 rounded-card border bg-surface p-5 transition-colors hover:border-navy has-checked:border-navy has-checked:bg-cream has-checked:ring-1 has-checked:ring-navy has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent-500 ${
              error ? "border-red-600" : "border-line"
            }`}
          >
            <input
              // The first option carries the field id, so the error summary can focus the group.
              id={index === 0 ? fieldId(field) : undefined}
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.icon && (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cream text-navy">
                {option.icon}
              </span>
            )}
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-lg font-semibold text-navy">
                {option.label}
                {value === option.value && (
                  <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5 fill-navy">
                    <path d="M10 1.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17Zm3.7 5.8a1 1 0 0 0-1.4 0L9 10.6 7.7 9.3a1 1 0 1 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4a1 1 0 0 0 0-1.4Z" />
                  </svg>
                )}
              </span>
              <span className="mt-1 block text-sm leading-6 text-muted">{option.description}</span>
            </span>
          </label>
        ))}
      </div>
      <FieldError field={field} message={error} />
    </fieldset>
  );
}

type SegmentedProps<T extends string> = {
  legend: string;
  name: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Visually hide the legend (when a visible label sits next to the control). */
  hideLegend?: boolean;
  className?: string;
};

/** Compact segmented radio control (currency, yes / no / unknown). */
export function Segmented<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  hideLegend = false,
  className = "",
}: SegmentedProps<T>) {
  return (
    <fieldset className={className}>
      <legend className={hideLegend ? "sr-only" : `${fieldLabel} mb-1`}>{legend}</legend>
      <div className="inline-flex rounded-full border border-line-strong bg-surface p-1">
        {options.map((option) => (
          <label
            key={option.value}
            className="inline-flex h-8 cursor-pointer items-center rounded-full px-3 text-sm font-semibold whitespace-nowrap text-navy transition-colors hover:bg-cream has-checked:bg-navy has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent-500"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
