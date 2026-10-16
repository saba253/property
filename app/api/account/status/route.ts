import { connection } from "next/server";
import { getAuth, getAuthStatus } from "@/lib/auth/instance";

/*
 * GET /api/account/status: what the header needs, for the visitor's own session only: whether
 * accounts are on, whether they are signed in, and a display label. Never the session token or
 * other users' data; never cached.
 */
export async function GET(request: Request) {
  // Always per request: without this, Next.js would prerender the answer at build time and
  // serve one shared response to everybody.
  await connection();
  const status = getAuthStatus();
  const headers = { "Cache-Control": "private, no-store" };
  if (!status.enabled) return Response.json({ enabled: false, signedIn: false }, { headers });
  try {
    const session = await getAuth()!.api.getSession({ headers: request.headers });
    if (!session) return Response.json({ enabled: true, signedIn: false }, { headers });
    return Response.json(
      { enabled: true, signedIn: true, name: session.user.name || null },
      { headers },
    );
  } catch (cause) {
    console.error(
      "[account/status] session check failed:",
      cause instanceof Error ? cause.name : "error",
    );
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}
