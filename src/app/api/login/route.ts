import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  checkPassword,
  createSessionToken,
  isConfigured,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "APP_PASSWORD is not set on the server." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";

  if (!(await checkPassword(password))) {
    // No detail about why — a wrong password and an unknown user look identical.
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
