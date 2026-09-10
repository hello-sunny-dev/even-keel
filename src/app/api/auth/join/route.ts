import { NextResponse } from "next/server";
import { createAccount, findUsableInvite, markInviteAccepted } from "@/lib/auth-server";
import { emailProblem, passwordProblem, signIn } from "@/lib/auth-routes";
import { createHousehold, seedCategories } from "@/lib/db/queries";
import { database } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Accept an invite.
 *
 * Two kinds: join the household that issued it, or start one of your own. The
 * second is how this reaches someone who is not in this household without
 * opening a public sign-up route.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  const db = await database();

  const invite = await findUsableInvite(db, token);
  if (!invite) {
    return NextResponse.json(
      { error: "That invite link is not valid any more. Ask for a new one." },
      { status: 404 },
    );
  }

  const problem = emailProblem(body.email) ?? passwordProblem(body.password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const account = await db.transaction(async (tx) => {
    let householdId = invite.householdId;
    if (invite.kind === "new_household") {
      const name =
        typeof body.householdName === "string" && body.householdName.trim()
          ? body.householdName.trim()
          : "Household";
      householdId = await createHousehold(tx, name);
      await seedCategories(tx, householdId);
    }

    const created = await createAccount(tx, {
      householdId: householdId!,
      email: body.email,
      displayName:
        typeof body.displayName === "string" && body.displayName.trim()
          ? body.displayName.trim()
          : body.email.split("@")[0],
      password: body.password,
    });
    await markInviteAccepted(tx, invite.token, created.id);
    return created;
  });

  return signIn(account);
}
