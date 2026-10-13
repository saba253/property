import { describe, expect, it } from "vitest";
import { DRAFT_STEPS, type DraftPhoto } from "@/lib/listing-draft/draft";
import { MAX_DRAFT_PHOTOS } from "@/lib/listing-draft/draft-photos";
import {
  type DraftAction,
  type DraftState,
  LAST_STEP_INDEX,
  createInitialDraftState,
  draftReducer,
} from "@/lib/listing-draft/draft-state";

const stepIndex = (id: (typeof DRAFT_STEPS)[number]["id"]) =>
  DRAFT_STEPS.findIndex((step) => step.id === id);

function run(state: DraftState, ...actions: DraftAction[]): DraftState {
  return actions.reduce(draftReducer, state);
}

function photo(id: string): DraftPhoto {
  return {
    id,
    url: `blob:${id}`,
    fileName: `${id}.jpg`,
    sizeBytes: 1000,
    mimeType: "image/jpeg",
    alt: "",
  };
}

/** A state on the amenities step with a valid apartment draft. */
function stateAtAmenities(): DraftState {
  return run(
    createInitialDraftState(),
    { type: "set-transaction", value: "sale" },
    { type: "next" },
    { type: "set-property-type", value: "apartment" },
    { type: "next" },
    { type: "set-field", field: "citySlug", value: "tbilisi" },
    { type: "set-field", field: "district", value: "ვაკე" },
    { type: "next" },
    { type: "set-field", field: "areaSqm", value: "65" },
    { type: "set-field", field: "floor", value: "3" },
    { type: "next" },
  );
}

describe("draftReducer: navigation", () => {
  it("starts on the first step without errors", () => {
    expect(createInitialDraftState()).toMatchObject({
      stepIndex: 0,
      furthestStepIndex: 0,
      errors: {},
    });
  });

  it("stays on a step and shows its errors when Next is pressed with missing values", () => {
    const state = draftReducer(createInitialDraftState(), { type: "next" });
    expect(state.stepIndex).toBe(0);
    expect(state.errors).toHaveProperty("transactionType");
  });

  it("clears a field's error as soon as it is edited", () => {
    const state = run(
      createInitialDraftState(),
      { type: "next" },
      { type: "set-transaction", value: "rent" },
    );
    expect(state.errors).toEqual({});
  });

  it("moves forward step by step and records the furthest step", () => {
    const state = stateAtAmenities();
    expect(state.stepIndex).toBe(stepIndex("amenities"));
    expect(state.furthestStepIndex).toBe(stepIndex("amenities"));
  });

  it("goes Back without losing entered values", () => {
    const state = run(stateAtAmenities(), { type: "back" }, { type: "back" });
    expect(state.stepIndex).toBe(stepIndex("location"));
    expect(state.draft).toMatchObject({ district: "ვაკე", areaSqm: "65", floor: "3" });
    expect(state.furthestStepIndex).toBe(stepIndex("amenities"));
  });

  it("does nothing on Back from the first step or Next from the last step", () => {
    const first = createInitialDraftState();
    expect(draftReducer(first, { type: "back" })).toBe(first);
    const last = { ...first, stepIndex: LAST_STEP_INDEX, furthestStepIndex: LAST_STEP_INDEX };
    expect(draftReducer(last, { type: "next" })).toBe(last);
  });

  it("jumps back to any reached step and forward again to a reached step", () => {
    const back = draftReducer(stateAtAmenities(), { type: "go-to-step", stepIndex: 1 });
    expect(back.stepIndex).toBe(1);
    const forward = draftReducer(back, { type: "go-to-step", stepIndex: stepIndex("amenities") });
    expect(forward.stepIndex).toBe(stepIndex("amenities"));
  });

  it("refuses to jump to steps that were not reached yet", () => {
    const state = stateAtAmenities();
    expect(draftReducer(state, { type: "go-to-step", stepIndex: LAST_STEP_INDEX })).toBe(state);
    expect(draftReducer(state, { type: "go-to-step", stepIndex: -1 })).toBe(state);
  });

  it("stops a forward jump at a step that became invalid", () => {
    const state = run(
      stateAtAmenities(),
      { type: "go-to-step", stepIndex: stepIndex("location") },
      { type: "set-field", field: "district", value: "" },
      { type: "go-to-step", stepIndex: stepIndex("amenities") },
    );
    expect(state.stepIndex).toBe(stepIndex("location"));
    expect(state.errors).toHaveProperty("district");
  });

  it("keeps values of the other property type but validates only the chosen one", () => {
    const state = run(
      stateAtAmenities(),
      { type: "go-to-step", stepIndex: stepIndex("details") },
      { type: "set-field", field: "floor", value: "abc" },
      { type: "go-to-step", stepIndex: stepIndex("propertyType") },
      { type: "set-property-type", value: "house" },
      { type: "go-to-step", stepIndex: stepIndex("amenities") },
    );
    expect(state.stepIndex).toBe(stepIndex("amenities"));
    expect(state.draft.floor).toBe("abc");
  });

  it("resets everything", () => {
    const state = draftReducer(stateAtAmenities(), { type: "reset" });
    expect(state).toEqual(createInitialDraftState());
  });
});

describe("draftReducer: values", () => {
  it("sets currency and three-state amenities", () => {
    const state = run(
      createInitialDraftState(),
      { type: "set-currency", value: "GEL" },
      { type: "set-amenity", key: "balcony", status: "yes" },
      { type: "set-amenity", key: "balcony", status: "unknown" },
      { type: "set-amenity", key: "furniture", status: "no" },
    );
    expect(state.draft.currency).toBe("GEL");
    expect(state.draft.amenities).toEqual({ balcony: "unknown", furniture: "no" });
  });
});

describe("draftReducer: photos", () => {
  it("adds photos up to the limit", () => {
    const many = Array.from({ length: MAX_DRAFT_PHOTOS + 3 }, (_, index) => photo(`p${index}`));
    const state = draftReducer(createInitialDraftState(), { type: "add-photos", photos: many });
    expect(state.draft.photos).toHaveLength(MAX_DRAFT_PHOTOS);
    const full = draftReducer(state, { type: "add-photos", photos: [photo("extra")] });
    expect(full).toBe(state);
  });

  it("reorders, sets the cover, describes and removes photos", () => {
    const ids = (state: DraftState) => state.draft.photos.map((item) => item.id);
    let state = draftReducer(createInitialDraftState(), {
      type: "add-photos",
      photos: [photo("a"), photo("b"), photo("c")],
    });
    state = draftReducer(state, { type: "move-photo", id: "a", delta: 1 });
    expect(ids(state)).toEqual(["b", "a", "c"]);
    state = draftReducer(state, { type: "move-photo", id: "b", delta: -1 });
    expect(ids(state)).toEqual(["b", "a", "c"]);
    state = draftReducer(state, { type: "make-cover", id: "c" });
    expect(ids(state)).toEqual(["c", "b", "a"]);
    state = draftReducer(state, { type: "set-photo-alt", id: "b", alt: "სამზარეულო" });
    expect(state.draft.photos[1].alt).toBe("სამზარეულო");
    state = draftReducer(state, { type: "remove-photo", id: "c" });
    expect(ids(state)).toEqual(["b", "a"]);
  });
});
