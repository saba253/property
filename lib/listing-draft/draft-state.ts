import { MAX_DRAFT_PHOTOS, makeCoverPhoto, movePhoto } from "@/lib/listing-draft/draft-photos";
import {
  DRAFT_STEPS,
  type DraftErrors,
  type DraftPhoto,
  type DraftTextField,
  type EditableAmenityKey,
  type ListingDraft,
  createEmptyDraft,
  validateDraftStep,
} from "@/lib/listing-draft/draft";
import type {
  AmenityStatus,
  Currency,
  PropertyType,
  TransactionType,
} from "@/lib/properties/types";

/** The whole state of the listing draft form. Plain data, updated only by draftReducer. */
export type DraftState = {
  draft: ListingDraft;
  /** Index into DRAFT_STEPS of the step shown now. */
  stepIndex: number;
  /** Furthest step reached so far; earlier steps can be revisited from the step list. */
  furthestStepIndex: number;
  /** Errors of the current step, shown after Next was pressed with missing or invalid values. */
  errors: DraftErrors;
};

export type DraftAction =
  | { type: "set-field"; field: DraftTextField; value: string }
  | { type: "set-transaction"; value: TransactionType }
  | { type: "set-property-type"; value: PropertyType }
  | { type: "set-currency"; value: Currency }
  | { type: "set-amenity"; key: EditableAmenityKey; status: AmenityStatus }
  | { type: "add-photos"; photos: DraftPhoto[] }
  | { type: "remove-photo"; id: string }
  | { type: "move-photo"; id: string; delta: -1 | 1 }
  | { type: "make-cover"; id: string }
  | { type: "set-photo-alt"; id: string; alt: string }
  | { type: "next" }
  | { type: "back" }
  | { type: "go-to-step"; stepIndex: number }
  | { type: "reset" };

export const LAST_STEP_INDEX = DRAFT_STEPS.length - 1;

export function createInitialDraftState(): DraftState {
  return { draft: createEmptyDraft(), stepIndex: 0, furthestStepIndex: 0, errors: {} };
}

function withoutError(errors: DraftErrors, ...fields: (keyof DraftErrors)[]): DraftErrors {
  if (!fields.some((field) => field in errors)) return errors;
  const next = { ...errors };
  for (const field of fields) delete next[field];
  return next;
}

function updateDraft(
  state: DraftState,
  patch: Partial<ListingDraft>,
  ...clearedErrors: (keyof DraftErrors)[]
): DraftState {
  return {
    ...state,
    draft: { ...state.draft, ...patch },
    errors: withoutError(state.errors, ...clearedErrors),
  };
}

/**
 * Moves forward from the current step towards `target`, stopping at the first step with
 * errors (whose errors are then shown). Steps already completed are not skipped unchecked, so
 * a later edit that makes an earlier step invalid is always caught.
 */
function advance(state: DraftState, target: number): DraftState {
  let index = state.stepIndex;
  while (index < target) {
    const errors = validateDraftStep(state.draft, DRAFT_STEPS[index].id);
    if (Object.keys(errors).length > 0) {
      return { ...state, stepIndex: index, errors };
    }
    index += 1;
  }
  return {
    ...state,
    stepIndex: index,
    furthestStepIndex: Math.max(state.furthestStepIndex, index),
    errors: {},
  };
}

/**
 * State transitions of the listing draft form. Going Back or jumping to an earlier step never
 * changes entered values; values that do not apply to a newly chosen property type are kept
 * (in case the user switches back) but ignored by validation and the preview.
 */
export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case "set-field":
      return updateDraft(state, { [action.field]: action.value }, action.field);
    case "set-transaction":
      return updateDraft(state, { transactionType: action.value }, "transactionType");
    case "set-property-type":
      return updateDraft(state, { propertyType: action.value }, "propertyType");
    case "set-currency":
      return updateDraft(state, { currency: action.value });
    case "set-amenity":
      return updateDraft(state, {
        amenities: { ...state.draft.amenities, [action.key]: action.status },
      });
    case "add-photos": {
      const room = MAX_DRAFT_PHOTOS - state.draft.photos.length;
      if (room <= 0) return state;
      return updateDraft(
        state,
        { photos: [...state.draft.photos, ...action.photos.slice(0, room)] },
        "photos",
      );
    }
    case "remove-photo":
      return updateDraft(
        state,
        { photos: state.draft.photos.filter((photo) => photo.id !== action.id) },
        "photos",
      );
    case "move-photo":
      return updateDraft(state, { photos: movePhoto(state.draft.photos, action.id, action.delta) });
    case "make-cover":
      return updateDraft(state, { photos: makeCoverPhoto(state.draft.photos, action.id) });
    case "set-photo-alt":
      return updateDraft(
        state,
        {
          photos: state.draft.photos.map((photo) =>
            photo.id === action.id ? { ...photo, alt: action.alt } : photo,
          ),
        },
        "photos",
      );
    case "next":
      return state.stepIndex >= LAST_STEP_INDEX ? state : advance(state, state.stepIndex + 1);
    case "back":
      return state.stepIndex === 0
        ? state
        : { ...state, stepIndex: state.stepIndex - 1, errors: {} };
    case "go-to-step": {
      const target = action.stepIndex;
      if (!Number.isInteger(target) || target < 0 || target > state.furthestStepIndex) {
        return state;
      }
      return target <= state.stepIndex
        ? { ...state, stepIndex: target, errors: {} }
        : advance(state, target);
    }
    case "reset":
      return createInitialDraftState();
    default: {
      const unexpected: never = action;
      return unexpected;
    }
  }
}
