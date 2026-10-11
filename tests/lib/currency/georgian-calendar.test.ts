import { describe, expect, it } from "vitest";
import {
  countBusinessDaysAfter,
  dateInTbilisi,
  isGeorgianBusinessDay,
  isGeorgianPublicHoliday,
  orthodoxEaster,
  parseIsoDate,
} from "@/lib/currency/georgian-calendar";

describe("parseIsoDate", () => {
  it("accepts real dates and rejects invalid ones", () => {
    expect(parseIsoDate("2026-10-10")).not.toBeNull();
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("2026-10-1")).toBeNull();
    expect(parseIsoDate("not-a-date")).toBeNull();
  });
});

describe("orthodoxEaster", () => {
  it("matches known Orthodox Easter dates", () => {
    expect(orthodoxEaster(2024)).toBe("2024-05-05");
    expect(orthodoxEaster(2025)).toBe("2025-04-20");
    expect(orthodoxEaster(2026)).toBe("2026-04-12");
    expect(orthodoxEaster(2027)).toBe("2027-05-02");
  });

  it("rejects years outside the supported range", () => {
    expect(() => orthodoxEaster(1899)).toThrow(RangeError);
    expect(() => orthodoxEaster(2100)).toThrow(RangeError);
  });
});

describe("isGeorgianPublicHoliday", () => {
  it("knows fixed-date holidays", () => {
    expect(isGeorgianPublicHoliday("2026-05-26")).toBe(true);
    expect(isGeorgianPublicHoliday("2026-01-07")).toBe(true);
    expect(isGeorgianPublicHoliday("2026-10-14")).toBe(true);
  });

  it("knows the movable Easter holidays (Good Friday to Easter Monday)", () => {
    for (const day of ["2026-04-10", "2026-04-11", "2026-04-12", "2026-04-13"]) {
      expect(isGeorgianPublicHoliday(day)).toBe(true);
    }
    expect(isGeorgianPublicHoliday("2026-04-14")).toBe(false);
  });

  it("returns false for an ordinary day", () => {
    expect(isGeorgianPublicHoliday("2026-10-13")).toBe(false);
  });
});

describe("isGeorgianBusinessDay", () => {
  it("excludes weekends and holidays", () => {
    expect(isGeorgianBusinessDay("2026-10-12")).toBe(true); // Monday
    expect(isGeorgianBusinessDay("2026-10-10")).toBe(false); // Saturday
    expect(isGeorgianBusinessDay("2026-10-11")).toBe(false); // Sunday
    expect(isGeorgianBusinessDay("2026-10-14")).toBe(false); // Wednesday, Svetitskhovloba
  });
});

describe("countBusinessDaysAfter", () => {
  it("counts business days after the first date, up to and including the second", () => {
    // Saturday -> Monday: only Monday counts.
    expect(countBusinessDaysAfter("2026-10-10", "2026-10-12")).toBe(1);
    // Saturday -> Thursday, with the Wednesday holiday: Mon, Tue, Thu.
    expect(countBusinessDaysAfter("2026-10-10", "2026-10-15")).toBe(3);
  });

  it("returns 0 for the same day or an earlier end date", () => {
    expect(countBusinessDaysAfter("2026-10-12", "2026-10-12")).toBe(0);
    expect(countBusinessDaysAfter("2026-10-12", "2026-10-01")).toBe(0);
  });

  it("rejects invalid dates", () => {
    expect(() => countBusinessDaysAfter("2026-13-01", "2026-10-12")).toThrow(RangeError);
  });
});

describe("dateInTbilisi", () => {
  it("uses Georgian time (UTC+4)", () => {
    expect(dateInTbilisi(new Date("2026-10-11T19:59:00Z"))).toBe("2026-10-11");
    expect(dateInTbilisi(new Date("2026-10-11T20:01:00Z"))).toBe("2026-10-12");
  });
});
