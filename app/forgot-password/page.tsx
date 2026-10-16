import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";
import { AuthShell, AuthUnavailable } from "@/components/auth/auth-shell";
import { getAuthStatus } from "@/lib/auth/instance";

export const metadata: Metadata = {
  title: "პაროლის აღდგენა | Property Intelligence",
  robots: { index: false, follow: false },
};

async function Forgot() {
  await connection();
  return getAuthStatus().enabled ? <ForgotPasswordForm /> : <AuthUnavailable />;
}

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="პაროლის აღდგენა"
      intro="შეიყვანეთ ანგარიშის ელფოსტა და გამოგიგზავნით ახალი პაროლის დასაყენებელ ბმულს."
    >
      <Suspense fallback={<p className="text-sm text-muted">იტვირთება…</p>}>
        <Forgot />
      </Suspense>
    </AuthShell>
  );
}
