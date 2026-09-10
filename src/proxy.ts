import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSessionToken } from "@/lib/auth";

// Everything before sign-in. `/start` bootstraps the very first account and
// closes itself once one exists; `/join` accepts an invite.
const PUBLIC_PATHS = new Set([
  "/login",
  "/start",
  "/join",
  "/api/auth/login",
  "/api/auth/start",
  "/api/auth/join",
]);

/**
 * A per-request nonce, so the policy can be strict about scripts.
 *
 * `'unsafe-inline'` would be simpler and would also be a policy that permits
 * exactly the thing it exists to stop. Next puts this nonce on the scripts and
 * style tags it injects itself once it sees the header.
 *
 * `style-src-attr` is the one carve-out: this app colours things with
 * `style={{ background: "var(--pass)" }}`, and a nonce cannot apply to an
 * attribute. Inline style attributes cannot execute script, so what is being
 * allowed is CSS, not code.
 */
function policy(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // The hash is the SHA-256 of the empty string. Framer Motion inserts an
    // empty <style> element for its layout projection, which a nonce policy
    // refuses — twenty times a page load, for a tag that styles nothing.
    // Allowing exactly the empty string allows that and nothing else; the
    // alternative was 'unsafe-inline', which allows everything.
    `style-src 'self' 'nonce-${nonce}' 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/**
 * A state-changing request has to come from this app.
 *
 * The session cookie is SameSite=Lax, which already stops a cross-site form
 * post from carrying it. This is the second lock: it costs one comparison and
 * does not depend on every browser agreeing about what Lax means.
 */
function sameOrigin(request: NextRequest): boolean {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return true;
  const origin = request.headers.get("origin");
  if (!origin) return true; // Not sent by every client on same-origin requests.
  return origin === request.nextUrl.origin;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = btoa(crypto.randomUUID());
  const csp = policy(nonce, process.env.NODE_ENV === "development");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);

  const send = (response: NextResponse) => {
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };
  const forward = () => send(NextResponse.next({ request: { headers } }));

  if (!sameOrigin(request)) {
    return send(NextResponse.json({ error: "Cross-site request refused." }, { status: 403 }));
  }

  if (PUBLIC_PATHS.has(pathname)) return forward();

  // Signature and expiry only. Whether the session version still matches is
  // checked where the database is reachable — the proxy runs on the edge.
  const claims = await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value).catch(
    () => null,
  );
  if (claims) return forward();

  if (pathname.startsWith("/api/")) {
    return send(NextResponse.json({ error: "Not signed in" }, { status: 401 }));
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return send(NextResponse.redirect(url));
}

// Everything except Next's own assets. Nothing about this app is public, so
// the default is "gated" and the exceptions are listed above.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
