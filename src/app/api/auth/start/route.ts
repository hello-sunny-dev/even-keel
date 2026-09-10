import { NextResponse } from "next/server";
import { countUsers, createAccount } from "@/lib/auth-server";
import { emailProblem, passwordProblem, signIn } from "@/lib/auth-routes";
import { createHousehold, seedCategories } from "@/lib/db/queries";
import { database } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Create the very first account, and the household it keeps.
 *
 * This is a bootstrap, not registration: it refuses once any account exists,
 * so there is no open sign-up route to find. Everyone after the first arrives
 * through an invite.
 */
export async function POST(request: Request) {
  const db = await database();

  if ((await countUsers(db)) > 0) {
    return NextResponse.json(
      { error: "This app already has an account. Ask for an invite link." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const problem = emailProblem(body.email) ?? passwordProblem(body.password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const householdName =
    typeof body.householdName === "string" && body.householdName.trim()
      ? body.householdName.trim()
      : "Household";

  const household = await createHousehold(db, householdName);
  await seedCategories(db, household);

  const account = await createAccount(db, {
    householdId: household,
    email: body.email,
    displayName:
      typeof body.displayName === "string" && body.displayName.trim()
        ? body.displayName.trim()
        : body.email.split("@")[0],
    password: body.password,
  });

  return signIn(account);
}
