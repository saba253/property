import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ErrorPage from "@/app/error";

describe("error page", () => {
  it("explains the problem in Georgian without technical details or substitute data", () => {
    const error = Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:5432 password=x"), {
      digest: "12345",
    });
    const html = renderToStaticMarkup(createElement(ErrorPage, { error, retry: () => {} }));
    expect(html).toContain("მონაცემების ჩატვირთვა ვერ მოხერხდა");
    expect(html).toContain("თავიდან ცდა");
    expect(html).toContain("კოდი: 12345");
    expect(html).not.toContain("ECONNREFUSED");
    expect(html).not.toContain("password");
    expect(html).not.toContain("demo-listing");
  });
});
