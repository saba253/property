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

/** The known city with this Georgian name (as in Property.city), or null. */
export function findCityByName(name: string): City | null {
  return knownCities.find((city) => city.name === name) ?? null;
}

/** Known cities that appear in the given city names, in `knownCities` order. */
export function getCitiesPresentIn(cityNames: readonly string[]): City[] {
  const present = new Set(cityNames);
  return knownCities.filter((city) => present.has(city.name));
}

/** A district as it appears in the listing data, with its city's Georgian name. */
export type DistrictOption = { name: string; city: string };

/**
 * Districts present in the given properties, in first-seen order, without duplicates. Districts
 * come only from listing data; there is no hardcoded district directory.
 */
export function getDistrictsPresentIn(
  places: readonly { city: string; district: string }[],
): DistrictOption[] {
  const seen = new Set<string>();
  const result: DistrictOption[] = [];
  for (const { city, district } of places) {
    const key = `${city}\u0000${district}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ name: district, city });
    }
  }
  return result;
}
