"use client";

import { type FormEvent, useEffect, useReducer, useRef, useState } from "react";
import { saveDraftAction } from "@/app/account/listings/actions";
import { useAccountStatus } from "@/components/auth/use-account-status";
import { DraftPhotoManager } from "@/components/listing-draft/draft-photo-manager";
import { DraftPreview } from "@/components/listing-draft/draft-preview";
import { DRAFT_RESUME_KEY, DraftSavePanel } from "@/components/listing-draft/draft-save-panel";
import { fieldId } from "@/components/listing-draft/draft-fields";
import {
  AmenitiesStep,
  DetailsStep,
  LocationStep,
  PhotosStep,
  PriceStep,
  PropertyTypeStep,
  TransactionStep,
} from "@/components/listing-draft/draft-steps";
import { buttonPrimary, buttonSecondary, card } from "@/components/ui/styles";
import type { ExchangeRateState } from "@/lib/currency/exchange-rate";
import {
  DRAFT_STEPS,
  type DraftField,
  type DraftPhoto,
  type ListingDraft,
  buildDraftListing,
  getDraftFieldLabel,
  isDraftDirty,
} from "@/lib/listing-draft/draft";
import { type PhotoRejection, checkPhotoFiles } from "@/lib/listing-draft/draft-photos";
import {
  LAST_STEP_INDEX,
  createInitialDraftState,
  draftReducer,
} from "@/lib/listing-draft/draft-state";
import { parseDraftInput } from "@/lib/drafts/draft-input";
import type { PhotoView } from "@/lib/photos/photo-types";
import { assertNever } from "@/lib/properties/listing-types";
import type { DistrictOption } from "@/lib/properties/cities";

type ListingDraftWizardProps = {
  rateState: ExchangeRateState;
  /** District suggestions (from listing data) for the location step. */
  districts: readonly DistrictOption[];
  /** A stored private draft to edit (from the server, already checked to be the user's). */
  initialDraft?: ListingDraft;
  /** Its id; null for a new draft. */
  draftId?: string | null;
  /** The draft's stored photos (owner-only), when editing a saved draft. */
  initialPhotos?: PhotoView[];
};

/** Stored photos in the preview's shape: the cover first, then the chosen order. */
function storedAsDraftPhotos(photos: readonly PhotoView[]): DraftPhoto[] {
  const ordered = [...photos].sort(
    (a, b) => Number(b.isCover) - Number(a.isCover) || a.order - b.order,
  );
  return ordered.map((photo) => ({
    id: photo.id,
    url: photo.url,
    fileName: "",
    sizeBytes: photo.byteSize,
    mimeType: "image/webp",
    alt: photo.alt,
  }));
}

/** The draft without photos, to compare with the last saved version. */
const snapshot = (draft: ListingDraft) => JSON.stringify({ ...draft, photos: [] });

/** Field order for moving focus to the first field with an error. */
const FIELD_ORDER: readonly DraftField[] = [
  "transactionType",
  "propertyType",
  "citySlug",
  "district",
  "areaSqm",
  "rooms",
  "bedrooms",
  "bathrooms",
  "floor",
  "totalFloors",
  "storeys",
  "landAreaSqm",
  "price",
  "title",
  "photos",
];

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-current">
      <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" />
    </svg>
  );
}

/**
 * Guided, multi-step listing draft form with a final preview. Form state lives in this component
 * (useReducer with the pure draftReducer) until a signed-in user saves it as a private draft.
 * Signed-in users store photos with the saved draft (DraftPhotoManager); visitors get local
 * previews from object URLs that are released when no longer needed and never uploaded.
 */
export function ListingDraftWizard({
  rateState,
  districts,
  initialDraft,
  draftId: initialDraftId = null,
  initialPhotos = [],
}: ListingDraftWizardProps) {
  const [state, dispatch] = useReducer(draftReducer, initialDraft, (draft) =>
    draft
      ? draftReducer(createInitialDraftState(), { type: "load", draft })
      : createInitialDraftState(),
  );
  const [draftId, setDraftId] = useState<string | null>(initialDraftId);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(
    initialDraft ? snapshot({ ...initialDraft, photos: [] }) : null,
  );
  const [rejections, setRejections] = useState<PhotoRejection[]>([]);
  // Photos stored with the saved draft (signed-in users); local previews stay in state.draft.photos.
  const [storedPhotos, setStoredPhotos] = useState<PhotoView[]>(initialPhotos);
  const [savingForPhotos, setSavingForPhotos] = useState(false);
  const [saveForPhotosError, setSaveForPhotosError] = useState<string | null>(null);
  const account = useAccountStatus();
  // A stored draft is opened only by its signed-in owner (checked on the server), so its photos
  // show immediately; for new drafts the account status decides once it is known.
  const storesPhotos = account ? account.enabled && account.signedIn : Boolean(initialDraft);
  const [submitAttempt, setSubmitAttempt] = useState(0);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepListRef = useRef<HTMLOListElement>(null);
  const isFirstRender = useRef(true);
  const photosRef = useRef<DraftPhoto[]>([]);
  const nextPhotoId = useRef(1);

  const step = DRAFT_STEPS[state.stepIndex];
  // Unsaved work: something entered that differs from the last version stored on the server.
  const saved = savedSnapshot !== null && savedSnapshot === snapshot(state.draft);
  const dirty = isDraftDirty(state.draft) && !(saved && state.draft.photos.length === 0);

  // After signing in from this form, restore the entries parked in this tab (then forget them).
  useEffect(() => {
    if (initialDraft) return;
    try {
      const parked = sessionStorage.getItem(DRAFT_RESUME_KEY);
      if (!parked) return;
      sessionStorage.removeItem(DRAFT_RESUME_KEY);
      const draft = parseDraftInput(JSON.parse(parked));
      if (draft) dispatch({ type: "load", draft });
    } catch {
      // Nothing to restore.
    }
  }, [initialDraft]);

  // Remember the current photos so their object URLs can be released when the page unmounts.
  useEffect(() => {
    photosRef.current = state.draft.photos;
  }, [state.draft.photos]);
  useEffect(() => {
    return () => {
      for (const photo of photosRef.current) URL.revokeObjectURL(photo.url);
    };
  }, []);

  // There is no autosave: warn before a refresh or close would discard entered data.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // On phones the step list scrolls sideways: keep the current step visible in it.
  useEffect(() => {
    const list = stepListRef.current;
    const current = list?.children[state.stepIndex] as HTMLElement | undefined;
    if (list && current && list.scrollWidth > list.clientWidth) {
      list.scrollTo({ left: current.offsetLeft - 16, behavior: "smooth" });
    }
  }, [state.stepIndex]);

  // Move focus to the new step's heading, so keyboard and screen reader users start there.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    setRejections([]);
    setConfirmingReset(false);
  }, [state.stepIndex]);

  // After a Next with errors, focus the first field that needs attention.
  useEffect(() => {
    if (submitAttempt === 0) return;
    const first = FIELD_ORDER.find((field) => state.errors[field]);
    if (first) document.getElementById(fieldId(first))?.focus();
    // Only when Next was pressed; editing a field must not move focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitAttempt]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatch({ type: "next" });
    setSubmitAttempt((count) => count + 1);
  }

  function addFiles(files: File[]) {
    const { accepted, rejected } = checkPhotoFiles(files, state.draft.photos.length);
    setRejections(rejected);
    const photos: DraftPhoto[] = accepted.map((index) => {
      const file = files[index];
      return {
        id: `photo-${nextPhotoId.current++}`,
        url: URL.createObjectURL(file),
        fileName: file.name,
        sizeBytes: file.size,
        mimeType: file.type,
        alt: "",
      };
    });
    if (photos.length > 0) dispatch({ type: "add-photos", photos });
  }

  function removePhoto(id: string) {
    const photo = state.draft.photos.find((item) => item.id === id);
    if (photo) URL.revokeObjectURL(photo.url);
    dispatch({ type: "remove-photo", id });
  }

  // Photos need a stored draft to belong to: save first (the steps before are already valid),
  // then upload. The address becomes the draft's edit page, so a refresh reopens it with photos.
  async function saveForPhotos() {
    setSavingForPhotos(true);
    setSaveForPhotosError(null);
    const result = await saveDraftAction({ ...state.draft, photos: [] }, draftId).catch(() => null);
    setSavingForPhotos(false);
    if (result?.ok) {
      setDraftId(result.id);
      setSavedSnapshot(snapshot(state.draft));
      window.history.replaceState(null, "", `/account/listings/edit?draft=${result.id}`);
    } else {
      setSaveForPhotosError(
        result?.reason === "unauthenticated"
          ? "სესია დასრულდა. შედით ანგარიშში და სცადეთ თავიდან."
          : result?.reason === "limit"
            ? "დრაფტების მაქსიმალურ რაოდენობას მიაღწიეთ."
            : "დრაფტი ვერ შეინახა. სცადეთ ცოტა ხანში.",
      );
    }
  }

  function resetDraft() {
    for (const photo of state.draft.photos) URL.revokeObjectURL(photo.url);
    dispatch({ type: "reset" });
    setConfirmingReset(false);
    setRejections([]);
  }

  const errorEntries = FIELD_ORDER.filter((field) => state.errors[field]).map(
    (field) => [field, state.errors[field]!] as const,
  );
  const preview = step.id === "review" ? buildDraftListing(state.draft) : null;

  function renderStep() {
    const props = { state, dispatch };
    switch (step.id) {
      case "transaction":
        return <TransactionStep {...props} />;
      case "propertyType":
        return <PropertyTypeStep {...props} />;
      case "location":
        return <LocationStep {...props} districts={districts} />;
      case "details":
        return <DetailsStep {...props} />;
      case "amenities":
        return <AmenitiesStep {...props} />;
      case "price":
        return <PriceStep {...props} rateState={rateState} />;
      case "photos":
        if (account === null && !initialDraft) {
          return <p className="text-sm text-muted">იტვირთება…</p>;
        }
        if (storesPhotos && draftId) {
          return (
            <DraftPhotoManager draftId={draftId} photos={storedPhotos} onChange={setStoredPhotos} />
          );
        }
        if (storesPhotos) {
          return (
            <div className="space-y-4">
              <div className="rounded-2xl border border-line bg-cream px-4 py-4 text-sm leading-6 text-navy">
                <p className="font-semibold">ფოტოების ასატვირთად ჯერ დრაფტი შეინახეთ.</p>
                <p className="mt-1 text-muted">
                  ფოტოები ინახება შენახულ პირად დრაფტთან ერთად. დანარჩენი მონაცემების შეცვლა
                  შემდეგაც შეგიძლიათ. ეს ნაბიჯი არასავალდებულოა.
                </p>
              </div>
              {saveForPhotosError && (
                <p
                  role="alert"
                  className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200"
                >
                  {saveForPhotosError}
                </p>
              )}
              <button
                type="button"
                onClick={saveForPhotos}
                disabled={savingForPhotos}
                className={`${buttonPrimary} disabled:opacity-60`}
              >
                {savingForPhotos ? "ინახება…" : "დრაფტის შენახვა და ფოტოების დამატება"}
              </button>
            </div>
          );
        }
        return (
          <PhotosStep
            {...props}
            onAddFiles={addFiles}
            onRemove={removePhoto}
            rejections={rejections}
          />
        );
      case "review":
        return preview ? (
          <DraftPreview
            item={preview}
            photos={storesPhotos ? storedAsDraftPhotos(storedPhotos) : state.draft.photos}
            rateState={rateState}
            storedPhotos={storesPhotos}
          />
        ) : (
          <p className="text-muted">დრაფტში შეცდომებია. დაბრუნდით წინა ნაბიჯებზე.</p>
        );
      default:
        return assertNever(step);
    }
  }

  return (
    // minmax(0, 1fr): the horizontally scrolling step list must not widen the page on phones.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
      <nav aria-label="ნაბიჯები" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <p className="text-sm font-medium text-muted lg:hidden">
          ნაბიჯი {state.stepIndex + 1} / {DRAFT_STEPS.length}
        </p>
        <div
          aria-hidden="true"
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-line lg:hidden"
        >
          <div
            className="h-full rounded-full bg-navy transition-[width] duration-300"
            style={{ width: `${((state.stepIndex + 1) / DRAFT_STEPS.length) * 100}%` }}
          />
        </div>
        {/* relative: keeps the visually hidden text inside the scrolling list on phones. */}
        <ol
          ref={stepListRef}
          className="relative mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none] lg:mt-0 lg:flex-col lg:gap-1 lg:overflow-visible"
        >
          {DRAFT_STEPS.map((item, index) => {
            const current = index === state.stepIndex;
            const reachable = index <= state.furthestStepIndex;
            const done = index < state.furthestStepIndex && !current;
            const marker = (
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  current
                    ? "bg-navy text-white"
                    : done
                      ? "bg-accent-50 text-accent-700 ring-1 ring-accent-100"
                      : "bg-surface text-subtle ring-1 ring-line"
                }`}
              >
                {done ? <CheckIcon /> : index + 1}
              </span>
            );
            const content = (
              <>
                {marker}
                <span className="whitespace-nowrap">{item.title}</span>
              </>
            );
            const base =
              "flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-left text-sm lg:rounded-xl";
            return (
              <li key={item.id} className="shrink-0">
                {reachable && !current ? (
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "go-to-step", stepIndex: index })}
                    className={`${base} font-medium text-navy transition-colors hover:bg-cream`}
                  >
                    {content}
                  </button>
                ) : (
                  <span
                    aria-current={current ? "step" : undefined}
                    className={`${base} ${current ? "bg-cream font-semibold text-navy" : "text-subtle"}`}
                  >
                    {content}
                    {!reachable && <span className="sr-only"> (ჯერ მიუწვდომელია)</span>}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <form noValidate onSubmit={handleSubmit} className={`${card} min-w-0 p-5 sm:p-8`}>
        <p className="text-xs font-semibold tracking-wide text-accent-700">
          ნაბიჯი {state.stepIndex + 1} / {DRAFT_STEPS.length}
        </p>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="mt-1 text-2xl font-bold tracking-tight text-navy outline-none"
        >
          {step.title}
        </h2>

        {errorEntries.length > 0 && (
          <div
            role="alert"
            className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            <p className="font-semibold">გთხოვთ, შეასწოროთ მონიშნული ველები:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {errorEntries.map(([field, message]) => (
                <li key={field}>
                  <a
                    href={`#${fieldId(field)}`}
                    onClick={(event) => {
                      event.preventDefault();
                      document.getElementById(fieldId(field))?.focus();
                    }}
                    className="underline underline-offset-2"
                  >
                    {getDraftFieldLabel(field, state.draft.propertyType)}: {message}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6">{renderStep()}</div>

        <div className="mt-8 flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          {state.stepIndex > 0 ? (
            <button
              type="button"
              onClick={() => dispatch({ type: "back" })}
              className={buttonSecondary}
            >
              ← უკან
            </button>
          ) : (
            <span className="hidden sm:block" />
          )}

          {state.stepIndex < LAST_STEP_INDEX ? (
            <button type="submit" className={buttonPrimary}>
              {state.stepIndex === LAST_STEP_INDEX - 1 ? "გადახედვა →" : "შემდეგი →"}
            </button>
          ) : confirmingReset ? (
            <div
              role="group"
              aria-label="დრაფტის გასუფთავება"
              className="flex flex-wrap items-center gap-2"
            >
              <span className="text-sm text-muted">
                {draftId
                  ? "ფორმის ველები გასუფთავდება. შენახული დრაფტი და მისი ფოტოები არ წაიშლება."
                  : "ყველა მონაცემი და ფოტო წაიშლება."}
              </span>
              <button
                type="button"
                onClick={resetDraft}
                className={`${buttonSecondary} border-red-300 text-red-700 hover:border-red-600`}
              >
                დიახ, გასუფთავება
              </button>
              <button
                type="button"
                onClick={() => setConfirmingReset(false)}
                className={buttonSecondary}
              >
                გაუქმება
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingReset(true)}
              className={buttonSecondary}
            >
              დრაფტის გასუფთავება
            </button>
          )}
        </div>

        {step.id === "review" && preview && (
          <DraftSavePanel
            draft={state.draft}
            draftId={draftId}
            saved={saved}
            onSaved={(id) => {
              setDraftId(id);
              setSavedSnapshot(snapshot(state.draft));
            }}
          />
        )}
      </form>
    </div>
  );
}
