import { NextResponse } from "next/server";
import { createInvite, revokeInvite } from "@/lib/auth-server";
import { currentSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const kind = body.kind === "new_household" ? "new_household" : "join";

  const invite = await createInvite(session.db, {
    kind,
    householdId: kind === "join" ? session.household : null,
    createdBy: session.account.id,
    note: typeof body.note === "string" ? body.note.slice(0, 120) : undefined,
  });

  return NextResponse.json({ invite });
}

export async function DELETE(request: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const token = new URL(request.url).searchParams.get("token") ?? "";
  await revokeInvite(session.db, token, session.household);
  return NextResponse.json({ ok: true });
}
