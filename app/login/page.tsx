import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/auth-forms";
import { AuthShell, AuthUnavailable, FormMessage } from "@/components/auth/auth-shell";
import { getAuthStatus } from "@/lib/auth/instance";
import { safeRedirectPath } from "@/lib/auth/redirect";

export const metadata: Metadata = {
  title: "შესვლა | Property Intelligence",
  robots: { index: false, follow: false },
};

async function Login({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  await connection(); // the configuration is read at request time, never baked into a build
  const query = await searchParams;
  const status = getAuthStatus();
  if (!status.enabled) return <AuthUnavailable />;
  const next = safeRedirectPath(query.next);
  return (
    <div className="space-y-4">
      {query.verified === "1" && !query.error && (
        <FormMessage tone="info">ელფოსტა დადასტურდა. ახლა შეგიძლიათ შეხვიდეთ.</FormMessage>
      )}
      {query.error && (
        <FormMessage tone="error">
          დადასტურების ბმული არასწორია ან ვადაგასულია. სცადეთ შესვლა და ახალი ბმული გამოიგზავნება.
        </FormMessage>
      )}
      <LoginForm next={next} google={status.google} />
    </div>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthShell title="შესვლა">
      <Suspense fallback={<p className="text-sm text-muted">იტვირთება…</p>}>
        <Login searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}
