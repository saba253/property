/*
 * Browser calls to Better Auth's endpoints (/api/auth/*), so its rate limits and origin checks
 * apply. Same-origin fetch; the session cookie is HttpOnly and never readable by scripts. Nothing
 * is stored in localStorage.
 */
export type AuthResult = { ok: boolean; status: number; code: string | null; data: unknown };

export async function authRequest(
  path: string,
  body: Record<string, unknown>,
): Promise<AuthResult> {
  try {
    const response = await fetch(`/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    const code =
      data && typeof data === "object" && "code" in data && typeof data.code === "string"
        ? data.code
        : null;
    return { ok: response.ok, status: response.status, code, data };
  } catch {
    return { ok: false, status: 0, code: "NETWORK", data: null };
  }
}
