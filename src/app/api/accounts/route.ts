import { NextResponse } from "next/server";
import { addAccount, archiveAccount, setBalance } from "@/lib/db/queries";
import type { Account } from "@/lib/networth";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";

const KINDS: Account["kind"][] = ["cash", "investment", "super", "property", "loan"];
const BUCKETS: Account["bucket"][] = ["available", "invested", "locked"];
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function money(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { db, household } = await requireSession();

  if (body?.account) {
    const { name, kind, bucket } = body.account;
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Give the account a name." }, { status: 400 });
    }
    if (!KINDS.includes(kind) || !BUCKETS.includes(bucket)) {
      return NextResponse.json({ error: "Unknown kind of account." }, { status: 400 });
    }
    const id = await addAccount(db, household, { name: name.trim(), kind, bucket });
    return NextResponse.json({ ok: true, id });
  }

  if (body?.balance) {
    const { accountId, month, amount, contributed } = body.balance;
    const value = money(amount);
    if (typeof accountId !== "string" || !MONTH.test(month ?? "") || value === null) {
      return NextResponse.json(
        { error: "A balance needs an account, a month and an amount." },
        {
          status: 400,
        },
      );
    }
    // A loan is entered as what is owed. The database enforces this too; the
    // message here is the one a person actually reads.
    const stored = await setBalance(db, household, {
      accountId,
      month,
      amount: value,
      contributed: money(contributed) ?? 0,
    }).catch((error: Error) =>
      /amount owed/.test(error.message) ? "loan-sign" : Promise.reject(error),
    );

    if (stored === "loan-sign") {
      return NextResponse.json(
        { error: "A loan balance is what you still owe — enter it as a positive number." },
        { status: 400 },
      );
    }
    if (!stored) {
      return NextResponse.json({ error: "No such account." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body?.archive) {
    await archiveAccount(db, household, String(body.archive));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Nothing to do." }, { status: 400 });
}
