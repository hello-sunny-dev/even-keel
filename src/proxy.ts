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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  // Signature and expiry only. Whether the session version still matches is
  // checked where the database is reachable — the proxy runs on the edge.
  const claims = await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value).catch(
    () => null,
  );
  if (claims) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

// Everything except Next's own assets. Nothing about this app is public, so
// the default is "gated" and the exceptions are listed above.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
