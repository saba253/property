/**
 * Business-day helpers for judging whether an official NBG rate is likely current.
 *
 * Dates are plain "YYYY-MM-DD" strings (calendar dates in Georgia), so no time zone maths is
 * needed once a date has been determined.
 *
 * The holiday list follows the Labour Code of Georgia. The government can declare extra days
 * off, so this calendar is a best effort. Callers must word results as "possibly outdated",
 * never as certain.
 */

/** Fixed-date public holidays, as "MM-DD". */
const FIXED_HOLIDAYS: readonly string[] = [
  "01-01", // New Year
  "01-02", // New Year
  "01-07", // Orthodox Christmas
  "01-19", // Epiphany
  "03-03", // Mother's Day
  "03-08", // International Women's Day
  "04-09", // Day of National Unity
  "05-09", // Victory Day
  "05-12", // St. Andrew's Day
  "05-17", // Day of Family Sanctity
  "05-26", // Independence Day
  "08-28", // Mariamoba
  "10-14", // Svetitskhovloba
  "11-23", // Giorgoba
];

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Parses "YYYY-MM-DD" into a UTC midnight Date, or null if the string is not a real date. */
export function parseIsoDate(value: string): Date | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? date : null;
}

export function formatIsoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Orthodox Easter Sunday (Gregorian calendar) for years 1900-2099, as "YYYY-MM-DD". */
export function orthodoxEaster(year: number): string {
  if (!Number.isInteger(year) || year < 1900 || year > 2099) {
    throw new RangeError("year must be an integer between 1900 and 2099.");
  }
  // Meeus' Julian algorithm, then +13 days to convert Julian to Gregorian (valid 1900-2099).
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  const date = new Date(Date.UTC(year, month - 1, day + 13));
  return formatIsoDate(date);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** True for Georgian public holidays, including Orthodox Good Friday to Easter Monday. */
export function isGeorgianPublicHoliday(isoDate: string): boolean {
  const date = parseIsoDate(isoDate);
  if (!date) {
    throw new RangeError(`Invalid date: ${isoDate}`);
  }
  if (FIXED_HOLIDAYS.includes(isoDate.slice(5))) {
    return true;
  }
  const easter = parseIsoDate(orthodoxEaster(date.getUTCFullYear()))!;
  const easterDays = [-2, -1, 0, 1].map((offset) => formatIsoDate(addDays(easter, offset)));
  return easterDays.includes(isoDate);
}

export function isGeorgianBusinessDay(isoDate: string): boolean {
  const date = parseIsoDate(isoDate);
  if (!date) {
    throw new RangeError(`Invalid date: ${isoDate}`);
  }
  const weekday = date.getUTCDay();
  return weekday !== 0 && weekday !== 6 && !isGeorgianPublicHoliday(isoDate);
}

/**
 * Counts Georgian business days after `fromDate`, up to and including `toDate`.
 * Returns 0 when `toDate` is on or before `fromDate`.
 */
export function countBusinessDaysAfter(fromDate: string, toDate: string): number {
  const from = parseIsoDate(fromDate);
  const to = parseIsoDate(toDate);
  if (!from || !to) {
    throw new RangeError("Dates must be valid YYYY-MM-DD strings.");
  }
  let count = 0;
  for (let day = addDays(from, 1); day.getTime() <= to.getTime(); day = addDays(day, 1)) {
    if (isGeorgianBusinessDay(formatIsoDate(day))) {
      count++;
    }
  }
  return count;
}

/** The calendar date in Georgia (Asia/Tbilisi) for an instant, as "YYYY-MM-DD". */
export function dateInTbilisi(instant: Date): string {
  // "en-CA" formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tbilisi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}
