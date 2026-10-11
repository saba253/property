import type { Listing, Property } from "@/lib/properties/types";

// DEMO DATA ONLY. These are invented examples, not real properties or real listings.

export const demoProperties: readonly Property[] = [
  {
    id: "demo-property-1",
    city: "თბილისი",
    district: "ვაკე",
    areaSqm: 65,
    rooms: 3,
    floor: 5,
    dataSource: "demo",
  },
  {
    id: "demo-property-2",
    city: "ბათუმი",
    district: "ძველი ბათუმი",
    areaSqm: 48.5,
    rooms: 2,
    floor: 8,
    dataSource: "demo",
  },
];

export const demoListings: readonly Listing[] = [
  {
    id: "demo-listing-1",
    propertyId: "demo-property-1",
    title: "დემო: ბინა ვაკეში",
    askingPrice: { amount: 150000, currency: "USD" },
    status: "active",
    dataSource: "demo",
  },
  {
    id: "demo-listing-2",
    propertyId: "demo-property-2",
    title: "დემო: ბინა ძველ ბათუმში",
    askingPrice: { amount: 220000, currency: "GEL" },
    status: "active",
    dataSource: "demo",
  },
];
