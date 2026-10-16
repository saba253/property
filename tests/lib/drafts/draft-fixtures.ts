import { createEmptyDraft, type ListingDraft } from "@/lib/listing-draft/draft";
import type { SqlConnection } from "@/lib/db/sql-client";
import type { DraftDeps } from "@/lib/drafts/draft-service";

/** A complete, valid draft as the form would send it (synthetic test data). */
export function sampleDraft(overrides: Partial<ListingDraft> = {}): ListingDraft {
  return {
    ...createEmptyDraft(),
    transactionType: "sale",
    propertyType: "apartment",
    citySlug: "tbilisi",
    district: "ვაკე",
    areaSqm: "72.5",
    rooms: "3",
    bedrooms: "2",
    bathrooms: "1",
    floor: "4",
    totalFloors: "9",
    price: "145000",
    currency: "GEL",
    title: "",
    amenities: { balcony: "yes", elevator: "no", furniture: "yes", dishwasher: "unknown" },
    ...overrides,
  };
}

/** Service dependencies for a given (or no) signed-in user on one connection. */
export function depsFor(db: SqlConnection, userId: string | null): DraftDeps {
  return {
    currentUserId: async () => userId,
    withConnection: (work) => work(db),
  };
}

export async function addUser(db: SqlConnection, id: string) {
  await db.query(`INSERT INTO users (id, name, email, "emailVerified") VALUES ($1, '', $2, true)`, [
    id,
    `${id}@example.com`,
  ]);
}
