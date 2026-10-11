export type Currency = "USD" | "GEL";

/** An amount in one currency. There is no conversion between currencies. */
export type Money = {
  amount: number;
  currency: Currency;
};

/** Only "demo" exists for now. Adding "real" later will be a deliberate change. */
export type DataSource = "demo";

/** The physical thing: facts about the building or apartment itself. */
export type Property = {
  id: string;
  city: string;
  district: string;
  areaSqm: number;
  /** Number of rooms. Optional: future listings may not state it. */
  rooms?: number;
  /** Floor the apartment is on. Optional: future listings may not state it. */
  floor?: number;
  dataSource: DataSource;
};

export type ListingStatus = "active" | "inactive";

/** An offer to sell a property. One property can have several listings over time. */
export type Listing = {
  id: string;
  propertyId: string;
  title: string;
  askingPrice: Money;
  status: ListingStatus;
  dataSource: DataSource;
};
