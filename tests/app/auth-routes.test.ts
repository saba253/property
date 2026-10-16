import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// Next.js-only modules: the routes run here without Next's server; "server-only" is a marker.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/properties",
  useRouter: () => ({ replace: vi.fn() }),
}));

const AUTH_KEYS = [
  "AUTH_ENABLED",
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "AUTH_SMTP_URL",
  "AUTH_EMAIL_FROM",
];
afterEach(() => vi.unstubAllEnvs());

describe("auth routes while accounts are not configured", () => {
  it("answers 404 for every Better Auth endpoint and never creates an auth instance", async () => {
    for (const key of AUTH_KEYS) vi.stubEnv(key, "");
    const { GET, POST } = await import("@/app/api/auth/[...all]/route");
    const { getAuth } = await import("@/lib/auth/instance");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    for (const response of [
      await POST(
        new Request("http://localhost/api/auth/sign-up/email", { method: "POST", body: "{}" }),
      ),
      await POST(
        new Request("http://localhost/api/auth/sign-in/email", { method: "POST", body: "{}" }),
      ),
      await GET(new Request("http://localhost/api/auth/get-session")),
    ]) {
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(getAuth()).toBeNull();
    info.mockRestore();
  });

  it("reports a signed-out, disabled status privately and without caching", async () => {
    for (const key of AUTH_KEYS) vi.stubEnv(key, "");
    const { GET } = await import("@/app/api/account/status/route");
    const response = await GET(new Request("http://localhost/api/account/status"));
    expect(await response.json()).toEqual({ enabled: false, signedIn: false });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("header account entry", () => {
  it("renders a plain sign-in link on the server (no account data, static pages stay static)", async () => {
    const { HeaderAccount } = await import("@/components/auth/header-account");
    const html = renderToStaticMarkup(createElement(HeaderAccount));
    expect(html).toContain('href="/login?next=%2Fproperties"');
    expect(html).toContain("შესვლა");
    expect(html).not.toContain("ჩემი ანგარიში");
    expect(html).not.toContain("გამოსვლა");
  });

  it("is the first entry of the existing header menu, which keeps every section", async () => {
    const { SiteHeader } = await import("@/components/site/site-header");
    const html = renderToStaticMarkup(createElement(SiteHeader));
    expect(html.indexOf("შესვლა")).toBeLessThan(html.indexOf("განცხადებების ძიება"));
    for (const href of ["/properties", "/favorites", "/compare", "/properties/new"]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).not.toContain("/saved-searches");
  });
});
