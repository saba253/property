import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { RegisterForm } from "@/components/auth/auth-forms";
import { AuthShell, AuthUnavailable } from "@/components/auth/auth-shell";
import { getAuthStatus } from "@/lib/auth/instance";

export const metadata: Metadata = {
  title: "რეგისტრაცია | Property Intelligence",
  robots: { index: false, follow: false },
};

async function Register() {
  await connection();
  return getAuthStatus().enabled ? <RegisterForm /> : <AuthUnavailable />;
}

export default function RegisterPage() {
  return (
    <AuthShell
      title="რეგისტრაცია"
      intro="ანგარიში საჭიროა მხოლოდ მომავალში განცხადებების დასამატებლად. ძიება, რჩეულები და შედარება ანგარიშის გარეშეც მუშაობს."
    >
      <Suspense fallback={<p className="text-sm text-muted">იტვირთება…</p>}>
        <Register />
      </Suspense>
    </AuthShell>
  );
}
