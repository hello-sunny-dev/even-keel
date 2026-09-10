import { NextResponse } from "next/server";
import { changePassword, passwordHashFor, verifyPassword } from "@/lib/auth-server";
import { passwordProblem, signIn } from "@/lib/auth-routes";
import { currentSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const current = typeof body.currentPassword === "string" ? body.currentPassword : "";

  const hash = await passwordHashFor(session.db, session.account.id);
  if (!(await verifyPassword(current, hash))) {
    return NextResponse.json({ error: "That is not your current password." }, { status: 401 });
  }

  const problem = passwordProblem(body.newPassword);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  // Bumps the session version, which stops every token issued against the old
  // password — including any on a device that is no longer yours.
  const version = await changePassword(session.db, session.account.id, body.newPassword);

  return signIn(
    { ...session.account, sessionVersion: version },
    {
      ok: true,
      message: "Password changed. Every other signed-in device has been signed out.",
    },
  );
}
