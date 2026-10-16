import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { AuthShell, AuthUnavailable } from "@/components/auth/auth-shell";
import { getAuthStatus } from "@/lib/auth/instance";

export const metadata: Metadata = {
  title: "ახალი პაროლი | Property Intelligence",
  // The token is in the URL of this page: never index it, never send it to other sites.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

async function Reset({ searchParams }: Pick<PageProps<"/reset-password">, "searchParams">) {
  await connection();
  if (!getAuthStatus().enabled) return <AuthUnavailable />;
  const query = await searchParams;
  const raw = Array.isArray(query.token) ? query.token[0] : query.token;
  // Better Auth redirects here with ?error=INVALID_TOKEN for invalid or expired links.
  const token = !query.error && raw && /^[A-Za-z0-9_-]{8,256}$/.test(raw) ? raw : null;
  return <ResetPasswordForm token={token} />;
}

export default function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  return (
    <AuthShell title="ახალი პაროლი">
      <Suspense fallback={<p className="text-sm text-muted">იტვირთება…</p>}>
        <Reset searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}
