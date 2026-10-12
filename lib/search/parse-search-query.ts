import type { City } from "@/lib/properties/cities";
import type { Currency, PropertyType, TransactionType } from "@/lib/properties/types";

/**
 * Small, deterministic, rule-based parser for Georgian free-text property searches, for example
 * "თბილისი 2 ოთახი 100000 დოლარამდე" or "ბათუმი ბინა ქირით".
 *
 * It does not try to understand arbitrary text. It recognizes a few clearly supported patterns
 * (place names from the listing data, room counts, budgets with an explicit currency or
 * "-მდე"/"-დან", property types, sale/rent words) and turns them into the same URL parameters the
 * filter form uses, so validation and filtering stay in lib/properties/listing-filters.ts.
 * Everything else is reported back as unrecognized instead of being guessed.
 */

export type SearchDistrict = { name: string; city: string };

export type SearchContext = {
  /** Cities present in the listing data (slug and Georgian name). */
  cities: readonly City[];
  /** Districts present in the listing data, with their city's Georgian name. */
  districts: readonly SearchDistrict[];
  /** Currency assumed for a budget without an explicit currency (the display currency). */
  defaultCurrency: Currency;
};

export type RecognizedTermKind =
  "city" | "district" | "rooms" | "propertyType" | "transaction" | "budget";

export type RecognizedTerm = { kind: RecognizedTermKind; label: string };

export type SearchNote =
  | { code: "currency-assumed"; currency: Currency }
  | { code: "number-without-meaning"; text: string }
  | { code: "conflict"; kind: RecognizedTermKind }
  | { code: "rooms-capped" };

export type ParsedSearch = {
  /** URL parameters for the listings page (same names the filter form uses). */
  params: Record<string, string>;
  recognized: RecognizedTerm[];
  /** Words from the query that were not understood and were not applied. */
  unrecognized: string[];
  notes: SearchNote[];
};

/** Longest query that is parsed; longer input is cut, so parsing stays cheap. */
export const MAX_SEARCH_QUERY_LENGTH = 200;

const ROOM_WORDS: Record<string, number> = {
  ერთი: 1,
  ერთ: 1,
  ორი: 2,
  ორ: 2,
  სამი: 3,
  სამ: 3,
  ოთხი: 4,
  ოთხ: 4,
  ხუთი: 5,
  ხუთ: 5,
};
const MAX_ROOMS = 5;

const STOP_WORDS = new Set([
  "და",
  "ან",
  "ში",
  "-ში",
  "მინდა",
  "ვეძებ",
  "ვეძებთ",
  "მაინტერესებს",
  "კერძო",
  "ფასი",
  "ფასით",
  "მდე",
  "-მდე",
  "დან",
  "-დან",
  "ქალაქი",
  "ქალაქში",
  "უბანი",
  "უბანში",
]);

const APARTMENT_WORD = /^ბინ(ა|ის|ები|ებს|ას|აში|ებში|ისთვის)$/;
const HOUSE_WORD = /^სახლ(ი|ის|ები|ებს|ს|ში|ებში|ისთვის)?$/;
const RENT_WORD = /^(ქირ(ა|ით|ის|ავდება|აობა|აობს|ავნობა)|გასაქირავებ\S*|დასაქირავებ\S*)$/;
const SALE_WORD = /^(იყიდება|ყიდვა|ვყიდულობ|გასაყიდ\S*|შესაძენ\S*|საყიდ\S*)$/;
const ROOM_NOUN = /^ოთახ\S*$/;
const COMPOUND_ROOMS = /^(\d+|ერთ|ორ|სამ|ოთხ|ხუთ)-?ოთახიან\S*$/;
const NUMBER = /^(\d{1,3}(?:[.,]\d{3})+|\d+)$/;
const THOUSAND_WORD = /^ათას\S*$/;

type CurrencyMatch = { currency: Currency; bound: "max" | "min" | null };

/** Reads a currency word or symbol, including attached "-მდე"/"-დან" (e.g. "დოლარამდე"). */
function readCurrencyWord(word: string): CurrencyMatch | null {
  const bound = /მდე$/.test(word) ? "max" : /დან$/.test(word) ? "min" : null;
  const stem = word.replace(/-?(მდე|დან)$/, "");
  if (/^(\$|usd|დოლარ\S*|დოლ\.?)$/.test(stem)) return { currency: "USD", bound };
  if (/^(₾|gel|ლარ\S*)$/.test(stem)) return { currency: "GEL", bound };
  return null;
}

/** "-მდე" / "-დან" written as a separate word or attached with a hyphen. */
function readBoundWord(word: string): "max" | "min" | null {
  if (/^-?მდე$/.test(word)) return "max";
  if (/^-?დან$/.test(word)) return "min";
  return null;
}

function formatAmount(amount: number, currency: Currency): string {
  const symbol = currency === "USD" ? "$" : "₾";
  return `${symbol}${new Intl.NumberFormat("en-US").format(amount)}`;
}

/** Stem used to match inflected forms: "ბათუმი" -> "ბათუმ" matches "ბათუმში". */
function stem(word: string): string {
  return word.length > 4 && word.endsWith("ი") ? word.slice(0, -1) : word;
}

function matchesPlace(tokens: readonly string[], start: number, name: string): number {
  const words = name.split(/\s+/);
  if (start + words.length > tokens.length) return 0;
  for (let offset = 0; offset < words.length; offset++) {
    const token = tokens[start + offset];
    const wordStem = stem(words[offset]);
    if (wordStem.length < 3 || !token.startsWith(wordStem) || token.length > wordStem.length + 6) {
      return 0;
    }
  }
  return words.length;
}

function tokenize(text: string): string[] {
  return text
    .slice(0, MAX_SEARCH_QUERY_LENGTH)
    .toLowerCase()
    .replace(/[,;!?„“"«»()]+/g, " ")
    .replace(/(\d)\s+(\d{3})(?!\d)/g, "$1$2") // "100 000" -> "100000"
    .replace(/(\$|₾)(\d)/g, "$1 $2") // "$100000" -> "$ 100000"
    .replace(/(\d)(\$|₾)/g, "$1 $2") // "100000$" -> "100000 $"
    .replace(/(\d)-(მდე|დან)/g, "$1 -$2") // "100000-მდე" -> "100000 -მდე"
    .replace(/(\$|₾)-(მდე|დან)/g, "$1 -$2")
    .split(/\s+/)
    .filter((token) => token !== "");
}

/**
 * Parses a free-text query. Recognized information becomes `params`; conflicting values (for
 * example two different cities) are not applied and are reported in `notes`.
 */
export function parseSearchQuery(text: string, context: SearchContext): ParsedSearch {
  const tokens = tokenize(text);
  const used = new Array<boolean>(tokens.length).fill(false);
  const notes: SearchNote[] = [];

  const cities = new Set<string>();
  const districts = new Set<string>();
  const roomCounts = new Set<number>();
  const types = new Set<PropertyType>();
  const transactions = new Set<TransactionType>();
  const budgets: { amount: number; currency: Currency | null; bound: "max" | "min" }[] = [];

  const mark = (start: number, count: number) => {
    for (let index = start; index < start + count; index++) used[index] = true;
  };

  // 1. Numbers: room counts ("2 ოთახი") and budgets ("100000 დოლარამდე", "$100000-მდე").
  for (let index = 0; index < tokens.length; index++) {
    if (used[index]) continue;
    const token = tokens[index];

    const compound = COMPOUND_ROOMS.exec(token);
    if (compound) {
      const value = ROOM_WORDS[compound[1]] ?? Number(compound[1]);
      roomCounts.add(value);
      mark(index, 1);
      continue;
    }

    const wordRooms = ROOM_WORDS[token];
    if (wordRooms !== undefined && ROOM_NOUN.test(tokens[index + 1] ?? "")) {
      roomCounts.add(wordRooms);
      mark(index, 2);
      continue;
    }

    if (!NUMBER.test(token)) continue;
    const value = Number(token.replace(/[.,]/g, ""));
    let next = index + 1;

    if (ROOM_NOUN.test(tokens[next] ?? "")) {
      roomCounts.add(value);
      mark(index, 2);
      continue;
    }

    let amount = value;
    if (THOUSAND_WORD.test(tokens[next] ?? "")) {
      amount *= 1000;
      next++;
    }

    // Currency may come before the number ("$ 100000") or after it ("100000 დოლარამდე").
    const before = index > 0 && !used[index - 1] ? readCurrencyWord(tokens[index - 1]) : null;
    const after = next < tokens.length ? readCurrencyWord(tokens[next]) : null;
    const currency: Currency | null = after?.currency ?? before?.currency ?? null;
    let bound = after?.bound ?? null;
    let end = after ? next + 1 : next;
    if (!bound && end < tokens.length) {
      bound = readBoundWord(tokens[end]);
      if (bound) end++;
    }

    if (!bound && !currency) {
      notes.push({ code: "number-without-meaning", text: token });
      continue;
    }
    if (before && !after) {
      used[index - 1] = true;
    }
    if (!bound) {
      bound = "max"; // "100000 დოლარი" is read as an upper budget.
    }
    budgets.push({ amount, currency, bound });
    mark(index, end - index);
  }

  // 2. Places: districts first (they also imply their city), then cities.
  const districtsByLength = [...context.districts].sort(
    (a, b) =>
      b.name.split(/\s+/).length - a.name.split(/\s+/).length || b.name.length - a.name.length,
  );
  for (let index = 0; index < tokens.length; index++) {
    if (used[index]) continue;
    for (const district of districtsByLength) {
      const length = matchesPlace(tokens, index, district.name);
      if (length > 0 && !used.slice(index, index + length).some(Boolean)) {
        districts.add(district.name);
        mark(index, length);
        break;
      }
    }
  }
  for (let index = 0; index < tokens.length; index++) {
    if (used[index]) continue;
    for (const city of context.cities) {
      if (matchesPlace(tokens, index, city.name) === 1) {
        cities.add(city.slug);
        mark(index, 1);
        break;
      }
    }
  }

  // 3. Property type, sale/rent intent, and filler words.
  for (let index = 0; index < tokens.length; index++) {
    if (used[index]) continue;
    const token = tokens[index];
    if (APARTMENT_WORD.test(token)) types.add("apartment");
    else if (HOUSE_WORD.test(token)) types.add("house");
    else if (RENT_WORD.test(token)) transactions.add("rent");
    else if (SALE_WORD.test(token)) transactions.add("sale");
    else if (!STOP_WORDS.has(token) && !readCurrencyWord(token)) continue;
    used[index] = true;
  }

  // 4. Build parameters; anything ambiguous is reported, not applied.
  const params: Record<string, string> = {};
  const recognized: RecognizedTerm[] = [];

  if (districts.size === 1) {
    const [name] = districts;
    const district = context.districts.find((item) => item.name === name)!;
    const city = context.cities.find((item) => item.name === district.city);
    const otherCity = [...cities].some((slug) => slug !== city?.slug);
    if (otherCity) {
      notes.push({ code: "conflict", kind: "district" });
    } else {
      params.district = name;
      recognized.push({ kind: "district", label: `უბანი: ${name}` });
      if (city) {
        params.city = city.slug;
        recognized.push({ kind: "city", label: `ქალაქი: ${city.name}` });
      }
      cities.clear();
    }
  } else if (districts.size > 1) {
    notes.push({ code: "conflict", kind: "district" });
  }

  if (cities.size === 1 && !params.city) {
    const [slug] = cities;
    const city = context.cities.find((item) => item.slug === slug)!;
    params.city = slug;
    recognized.push({ kind: "city", label: `ქალაქი: ${city.name}` });
  } else if (cities.size > 1) {
    notes.push({ code: "conflict", kind: "city" });
  }

  if (roomCounts.size === 1) {
    let [rooms] = roomCounts;
    if (rooms > MAX_ROOMS) {
      rooms = MAX_ROOMS;
      notes.push({ code: "rooms-capped" });
    }
    if (rooms >= 1) {
      params.rooms = String(rooms);
      recognized.push({
        kind: "rooms",
        label: rooms >= MAX_ROOMS ? `${MAX_ROOMS}+ ოთახი` : `${rooms} ოთახი`,
      });
    }
  } else if (roomCounts.size > 1) {
    notes.push({ code: "conflict", kind: "rooms" });
  }

  if (types.size === 1) {
    const [type] = types;
    params.type = type;
    recognized.push({ kind: "propertyType", label: type === "apartment" ? "ბინა" : "კერძო სახლი" });
  } else if (types.size > 1) {
    notes.push({ code: "conflict", kind: "propertyType" });
  }

  if (transactions.size === 1) {
    const [transaction] = transactions;
    params.transaction = transaction;
    recognized.push({
      kind: "transaction",
      label: transaction === "rent" ? "ქირავდება" : "იყიდება",
    });
  } else if (transactions.size > 1) {
    notes.push({ code: "conflict", kind: "transaction" });
  }

  if (budgets.length > 0) {
    const currencies = new Set(budgets.map((budget) => budget.currency).filter(Boolean));
    const maxCount = budgets.filter((budget) => budget.bound === "max").length;
    const minCount = budgets.filter((budget) => budget.bound === "min").length;
    if (currencies.size > 1 || maxCount > 1 || minCount > 1) {
      notes.push({ code: "conflict", kind: "budget" });
    } else {
      const currency = ([...currencies][0] as Currency | undefined) ?? context.defaultCurrency;
      if (currencies.size === 0) {
        notes.push({ code: "currency-assumed", currency });
      }
      // The budget is expressed in the display currency, so the display follows the budget.
      params.display = currency;
      const max = budgets.find((budget) => budget.bound === "max");
      const min = budgets.find((budget) => budget.bound === "min");
      if (max) params.maxPrice = String(max.amount);
      if (min) params.minPrice = String(min.amount);
      const parts = [
        min ? `${formatAmount(min.amount, currency)}-დან` : null,
        max ? `${formatAmount(max.amount, currency)}-მდე` : null,
      ].filter(Boolean);
      recognized.push({ kind: "budget", label: `ბიუჯეტი: ${parts.join(" ")}` });
    }
  }

  const unrecognized = tokens.filter(
    (token, index) =>
      !used[index] &&
      !notes.some((note) => note.code === "number-without-meaning" && note.text === token),
  );

  return { params, recognized, unrecognized, notes };
}
