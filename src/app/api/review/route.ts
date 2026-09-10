import { NextResponse } from "next/server";
import {
  applyToMerchantHistory,
  categoriseTransaction,
  categoryMap,
  rememberMerchant,
  splitTransaction,
} from "@/lib/db/queries";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";

function money(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { db, household } = await requireSession();
  const categories = await categoryMap(db, household);

  if (body?.tag) {
    const { id, categoryId, oneOff, merchantKey, applyToHistory, remember } = body.tag;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "Which transaction?" }, { status: 400 });
    }
    if (categoryId !== null && !categories.has(categoryId)) {
      return NextResponse.json({ error: "No such category." }, { status: 400 });
    }

    await categoriseTransaction(db, household, id, {
      categoryId,
      oneOffOverride: typeof oneOff === "boolean" ? oneOff : null,
    });

    // Two separate decisions, on purpose. Fixing this merchant's untagged
    // history is about the past; a rule is about every statement from now on,
    // and somebody may well want one without the other.
    let applied = 0;
    if (applyToHistory && categoryId && typeof merchantKey === "string") {
      applied = await applyToMerchantHistory(db, household, merchantKey, categoryId);
    }
    if (remember && categoryId && typeof merchantKey === "string") {
      await rememberMerchant(db, household, merchantKey, categoryId);
    }

    return NextResponse.json({ ok: true, applied });
  }

  if (body?.split) {
    const { id, parts } = body.split;
    if (typeof id !== "string" || !Array.isArray(parts) || parts.length < 2) {
      return NextResponse.json({ error: "A split needs at least two parts." }, { status: 400 });
    }

    const clean = [];
    for (const part of parts) {
      const amount = money(part.amount);
      if (amount === null || amount === 0) {
        return NextResponse.json({ error: "Every part needs an amount." }, { status: 400 });
      }
      if (!categories.has(part.categoryId)) {
        return NextResponse.json({ error: "Every part needs a category." }, { status: 400 });
      }
      clean.push({
        amount,
        categoryId: part.categoryId,
        oneOffOverride: typeof part.oneOff === "boolean" ? part.oneOff : null,
      });
    }

    try {
      await splitTransaction(db, household, id, clean);
    } catch (error) {
      // The parts adding up is the whole point of a split, and the message
      // says which way it is out rather than that something went wrong.
      return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Nothing to do." }, { status: 400 });
}
