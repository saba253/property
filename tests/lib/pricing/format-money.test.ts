import { describe, expect, it } from "vitest";
import { formatArea, formatMoney, formatPricePerSqm } from "@/lib/pricing/format-money";

describe("formatMoney", () => {
  it("formats USD with a dollar sign and thousands separators", () => {
    expect(formatMoney(150000, "USD")).toBe("$150,000");
  });

  it("formats GEL with the lari sign", () => {
    expect(formatMoney(350000, "GEL")).toBe("₾350,000");
  });
});

describe("formatPricePerSqm", () => {
  it("shows two decimals and the per-square-metre suffix", () => {
    expect(formatPricePerSqm(2307.69, "USD")).toBe("$2,307.69 / მ²");
  });

  it("keeps trailing zeros", () => {
    expect(formatPricePerSqm(2000, "USD")).toBe("$2,000.00 / მ²");
  });

  it("uses the lari sign for GEL", () => {
    expect(formatPricePerSqm(4536.08, "GEL")).toBe("₾4,536.08 / მ²");
  });
});

describe("formatArea", () => {
  it("shows whole areas without decimals", () => {
    expect(formatArea(65)).toBe("65 მ²");
  });

  it("shows fractional areas", () => {
    expect(formatArea(48.5)).toBe("48.5 მ²");
  });
});
