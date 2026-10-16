import { getAuth } from "@/lib/auth/instance";

/*
 * Better Auth's endpoints (/api/auth/*): sign-up, sign-in, sign-out, email verification, password
 * reset, Google sign-in. Rate limits, origin (CSRF) checks and cookie handling happen inside
 * Better Auth. While accounts are not configured, every endpoint answers 404.
 */
async function handle(request: Request) {
  const auth = getAuth();
  if (!auth) {
    return Response.json(
      { error: "auth-disabled" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  return auth.handler(request);
}

export { handle as GET, handle as POST };
