import { NextResponse } from "next/server";
import type { GoalKind } from "@/lib/goals";
import { saveGoal, saveSavingsPlans } from "@/lib/db/queries";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";

type Body = {
  goal?: {
    kind?: GoalKind;
    name?: string;
    targetAmount?: number;
    targetMonths?: number;
    openingBalance?: number;
    annualRate?: number;
    startMonth?: string;
  };
  scenarios?: { name?: string; monthlyAmount?: number; active?: boolean }[];
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function money(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const { db, household } = await requireSession();

  if (body?.goal) {
    const g = body.goal;
    const targetAmount = money(g.targetAmount);
    const openingBalance = money(g.openingBalance) ?? 0;
    const annualRate = money(g.annualRate) ?? 0;

    if (g.kind !== "cash" && g.kind !== "net_worth") {
      return NextResponse.json({ error: "Unknown kind of goal." }, { status: 400 });
    }
    if (targetAmount === null || targetAmount <= 0) {
      return NextResponse.json({ error: "Give the goal an amount to reach." }, { status: 400 });
    }
    if (!Number.isInteger(g.targetMonths) || g.targetMonths! < 1 || g.targetMonths! > 600) {
      return NextResponse.json(
        { error: "Give it between 1 and 600 months to happen in." },
        { status: 400 },
      );
    }
    if (!g.startMonth || !MONTH.test(g.startMonth)) {
      return NextResponse.json({ error: "Say which month it starts from." }, { status: 400 });
    }
    // A rate is written as 0.045, not 4.5. Anything above 1 is the percentage
    // typed straight in, and silently accepting it would compound 450% a year.
    if (annualRate < 0 || annualRate > 1) {
      return NextResponse.json(
        { error: "Rate is a fraction: 0.045 for 4.5% a year." },
        { status: 400 },
      );
    }

    await saveGoal(db, household, {
      kind: g.kind,
      name: g.name?.trim() || (g.kind === "cash" ? "Savings" : "Net worth"),
      targetAmount,
      targetMonths: g.targetMonths!,
      openingBalance,
      annualRate,
      startMonth: g.startMonth,
    });
  }

  if (body?.scenarios) {
    const scenarios = body.scenarios
      .map((s) => ({
        name: s.name?.trim() ?? "",
        monthlyAmount: money(s.monthlyAmount) ?? 0,
        active: Boolean(s.active),
      }))
      .filter((s) => s.name && s.monthlyAmount > 0);

    if (scenarios.length === 0) {
      return NextResponse.json(
        { error: "A scenario needs a name and an amount." },
        { status: 400 },
      );
    }
    if (scenarios.filter((s) => s.active).length !== 1) {
      return NextResponse.json(
        { error: "Exactly one scenario is the active one." },
        { status: 400 },
      );
    }

    await saveSavingsPlans(db, household, scenarios);
  }

  return NextResponse.json({ ok: true });
}
