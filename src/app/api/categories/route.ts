import { NextResponse } from "next/server";
import type { Cadence, CadenceUnit } from "@/lib/cadence";
import type { Category } from "@/lib/categories";
import {
  createCategory,
  listCategories,
  mergeCategories,
  setCategorySettings,
} from "@/lib/db/queries";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";

const GROUPS: Category["group"][] = [
  "Mortgage",
  "Insurance",
  "Utilities",
  "Subscriptions",
  "Food",
  "Transport",
  "Medical",
  "Personal",
  "Pet",
  "Other",
  "One-off",
  "Income",
];

const UNITS: CadenceUnit[] = ["day", "week", "month"];

function money(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function cadenceOf(value: unknown): Cadence | null {
  const c = value as Partial<Cadence> | undefined;
  if (!c || !UNITS.includes(c.unit as CadenceUnit)) return null;
  if (!Number.isInteger(c.count) || c.count! < 1 || c.count! > 60) return null;
  return { unit: c.unit as CadenceUnit, count: c.count! };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { db, household } = await requireSession();
  const categories = await listCategories(db, household);
  const byId = new Map(categories.map((c) => [c.id, c]));

  if (body?.create) {
    const { name, group, kind, oneOff, cadence } = body.create;
    const clean = typeof name === "string" ? name.trim() : "";
    if (!clean) return NextResponse.json({ error: "Give it a name." }, { status: 400 });
    if (clean.length > 60) {
      return NextResponse.json({ error: "Keep the name under 60 characters." }, { status: 400 });
    }
    if (!GROUPS.includes(group)) {
      return NextResponse.json({ error: "Choose a group for it." }, { status: 400 });
    }
    if (kind !== "expense" && kind !== "income") {
      return NextResponse.json({ error: "Is it money in or money out?" }, { status: 400 });
    }
    const rhythm = cadenceOf(cadence) ?? { unit: "month" as const, count: 1 };

    const id = await createCategory(db, household, {
      name: clean,
      group,
      kind,
      oneOff: Boolean(oneOff),
      cadence: rhythm,
    });
    return NextResponse.json({ ok: true, id });
  }

  if (body?.settings) {
    const { id, name, oneOff, cadence, targetMonthly, archived } = body.settings;
    if (typeof id !== "string" || !byId.has(id)) {
      return NextResponse.json({ error: "No such category." }, { status: 400 });
    }

    const patch: Parameters<typeof setCategorySettings>[3] = {};
    if (name !== undefined) {
      const clean = typeof name === "string" ? name.trim() : "";
      if (!clean) return NextResponse.json({ error: "A category needs a name." }, { status: 400 });
      patch.name = clean.slice(0, 60);
    }
    if (oneOff !== undefined) patch.oneOff = Boolean(oneOff);
    if (cadence !== undefined) {
      const rhythm = cadenceOf(cadence);
      if (!rhythm) return NextResponse.json({ error: "That is not a rhythm." }, { status: 400 });
      patch.cadence = rhythm;
    }
    if (targetMonthly !== undefined) {
      // Null clears the target; anything else has to be a real amount, because
      // a target of NaN silently disables the comparison it exists for.
      if (targetMonthly === null) patch.targetMonthly = null;
      else {
        const amount = money(targetMonthly);
        if (amount === null || amount < 0) {
          return NextResponse.json({ error: "A target is an amount." }, { status: 400 });
        }
        patch.targetMonthly = amount;
      }
    }
    if (archived !== undefined) patch.archived = Boolean(archived);

    await setCategorySettings(db, household, id, patch);
    return NextResponse.json({ ok: true });
  }

  if (body?.merge) {
    const { from, into } = body.merge;
    if (typeof from !== "string" || typeof into !== "string") {
      return NextResponse.json({ error: "Merge which into what?" }, { status: 400 });
    }
    if (from === into) {
      return NextResponse.json({ error: "That is the same category." }, { status: 400 });
    }
    const source = byId.get(from);
    const target = byId.get(into);
    if (!source || !target) {
      return NextResponse.json({ error: "No such category." }, { status: 400 });
    }
    // Merging across kinds would turn spending into income on the way past,
    // and the month's totals would change for no reason a person could see.
    if (source.kind !== target.kind) {
      return NextResponse.json(
        { error: `${source.name} is ${source.kind} and ${target.name} is ${target.kind}.` },
        { status: 400 },
      );
    }
    if (target.archived) {
      return NextResponse.json({ error: `${target.name} is archived.` }, { status: 400 });
    }

    const moved = await mergeCategories(db, household, from, into);
    return NextResponse.json({ ok: true, moved });
  }

  return NextResponse.json({ error: "Nothing to do." }, { status: 400 });
}
