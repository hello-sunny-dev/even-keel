import "server-only";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken } from "./auth";
import type { Account } from "./auth-server";

/** Sets the signed session cookie for an account. */
export async function signIn(account: Account, body: unknown = { ok: true }) {
  const response = NextResponse.json(body);
  response.cookies.set(
    SESSION_COOKIE,
    await createSessionToken({
      userId: account.id,
      version: account.sessionVersion,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    },
  );
  return response;
}

/** A password rule people can actually satisfy: long enough, and not blank. */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < 10) {
    return "Use at least 10 characters. Length is what makes a password hard to guess.";
  }
  return null;
}

export function emailProblem(email: unknown): string | null {
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "That does not look like an email address.";
  }
  return null;
}
