import { NextResponse } from "next/server";
import {
  findAccountByEmail,
  isRateLimited,
  passwordHashFor,
  recordLoginAttempt,
  verifyPassword,
  RATE_LIMIT,
} from "@/lib/auth-server";
import { signIn } from "@/lib/auth-routes";
import { database } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  const db = await database();

  if (await isRateLimited(db, email)) {
    return NextResponse.json(
      {
        error: `Too many attempts. Wait ${RATE_LIMIT.windowMinutes} minutes and try again.`,
      },
      { status: 429 },
    );
  }

  const account = await findAccountByEmail(db, email);
  // Verify even when the account does not exist, so the two cases take the
  // same time and cannot be told apart by how fast the answer comes back.
  const hash = account ? await passwordHashFor(db, account.id) : null;
  const ok = await verifyPassword(password, hash);

  await recordLoginAttempt(db, email, Boolean(account) && ok);

  if (!account || !ok) {
    // One message for both, so this cannot be used to discover addresses.
    return NextResponse.json({ error: "Wrong email or password." }, { status: 401 });
  }

  return signIn(account);
}
