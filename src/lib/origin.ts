/**
 * A state-changing request has to come from this app.
 *
 * The session cookie is SameSite=Lax, which already stops a cross-site form
 * post from carrying it. This is the second lock: it costs one comparison and
 * does not depend on every browser agreeing about what Lax means.
 *
 * The comparison is against the `Host` header the request actually arrived on,
 * because that is what the browser used to build the `Origin` it sent.
 * `request.nextUrl.origin` is not that: Next normalises it, and on a server
 * started with `next start` it reads `http://localhost:<port>` whatever host
 * was dialled. Compared against that, a browser at `http://127.0.0.1:3210`
 * has its own form posts refused as cross-site — and behind a proxy that
 * does not rewrite the private origin, so does every browser in production.
 *
 * Authority only, not scheme: `Host` carries no scheme, and behind TLS
 * termination the inbound scheme differs from the origin's by design. A
 * scheme mismatch is not the signal this check exists to catch.
 */
const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isSameOrigin(request: {
  method: string;
  headers: { get(name: string): string | null };
}): boolean {
  if (!UNSAFE.has(request.method)) return true;

  // Not sent by every client on a same-origin request; the cookie's SameSite
  // attribute is what is holding the line when it is missing.
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const forwarded = request.headers.get("x-forwarded-host");
  const host = (forwarded?.split(",")[0] ?? request.headers.get("host") ?? "").trim();
  if (!host) return false;

  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}
