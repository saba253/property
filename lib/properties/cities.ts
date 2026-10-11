/** A city that can be used in URL filters. `slug` is the URL value, `name` matches Property.city. */
export type City = {
  slug: string;
  name: string;
};

export const knownCities: readonly City[] = [
  { slug: "tbilisi", name: "თბილისი" },
  { slug: "batumi", name: "ბათუმი" },
];

export function findCityBySlug(slug: string): City | null {
  return knownCities.find((city) => city.slug === slug) ?? null;
}

/** Known cities that appear in the given city names, in `knownCities` order. */
export function getCitiesPresentIn(cityNames: readonly string[]): City[] {
  const present = new Set(cityNames);
  return knownCities.filter((city) => present.has(city.name));
}
