import { NextResponse } from "next/server";
import { effectiveKind } from "@/lib/aggregate";
import { categoryMap } from "@/lib/db/queries";
import { insertTransactions, replaceMonthTotals } from "@/lib/db/queries";
import { merchantKey, redactDescription } from "@/lib/redact";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function money(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { db, household } = await requireSession();
  const categories = await categoryMap(db, household);

  if (body?.transaction) {
    const t = body.transaction;
    const amount = money(t.amount);

    if (!DATE.test(t.date ?? "")) {
      return NextResponse.json({ error: "Give it a date." }, { status: 400 });
    }
    if (amount === null || amount === 0) {
      return NextResponse.json({ error: "Give it an amount." }, { status: 400 });
    }
    if (typeof t.description !== "string" || !t.description.trim()) {
      return NextResponse.json({ error: "Say what it was." }, { status: 400 });
    }
    if (t.categoryId && !categories.has(t.categoryId)) {
      return NextResponse.json({ error: "No such category." }, { status: 400 });
    }
    // The key comes from the form, not from the values, so pressing the button
    // twice writes one row while two genuinely identical entries — the same
    // $4.49 charged twice on one day — both survive.
    if (typeof t.clientKey !== "string" || t.clientKey.length < 8) {
      return NextResponse.json({ error: "Missing an entry key." }, { status: 400 });
    }

    // Redacted before it is stored, like every other path: a description typed
    // by hand can carry an account number just as easily as a parsed one.
    const description = redactDescription(t.description.trim());
    const row = {
      date: t.date,
      month: t.date.slice(0, 7),
      description,
      merchantKey: merchantKey(description),
      amount,
      balance: null,
      kind: effectiveKind(
        {
          kind: t.kind === "transfer" ? "transfer" : amount > 0 ? "income" : "expense",
          categoryId: t.categoryId ?? null,
          amount,
        },
        categories,
      ),
      categoryId: t.categoryId ?? null,
      oneOffOverride: typeof t.oneOff === "boolean" ? t.oneOff : null,
      needsReview: !t.categoryId,
      source: "manual" as const,
      granularity: "transaction" as const,
      sourceFingerprint: `manual:${t.clientKey}`,
    };

    const inserted = await insertTransactions(db, household, [row]);
    return NextResponse.json({ ok: true, inserted });
  }

  if (body?.month) {
    const { month, rows } = body;
    if (!MONTH.test(month ?? "")) {
      return NextResponse.json({ error: "Which month?" }, { status: 400 });
    }
    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    }

    const insertable = [];
    for (const r of rows) {
      const amount = money(r.amount);
      if (amount === null || amount === 0) continue;
      const category = categories.get(r.categoryId);
      if (!category) {
        return NextResponse.json({ error: "No such category." }, { status: 400 });
      }

      // Stored as it will be read: an expense is negative however it was typed,
      // because a month form is a list of what things cost.
      const signed = category.kind === "income" ? Math.abs(amount) : -Math.abs(amount);
      insertable.push({
        date: `${month}-01`,
        month,
        description: `${category.name} — month total`,
        merchantKey: "",
        amount: signed,
        balance: null,
        kind: category.kind,
        categoryId: category.id,
        oneOffOverride: null,
        needsReview: false,
        source: "manual" as const,
        granularity: "month" as const,
        sourceFingerprint: `month:${month}:${category.id}`,
      });
    }

    const inserted = await replaceMonthTotals(db, household, month, insertable);
    return NextResponse.json({ ok: true, inserted });
  }

  return NextResponse.json({ error: "Nothing to do." }, { status: 400 });
}
