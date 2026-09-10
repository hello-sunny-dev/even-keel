import { join } from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { createHousehold, firstHouseholdId, seedCategories } from "@/lib/db/queries";

export const runtime = "nodejs";

/** Idempotent: applies any pending migrations and seeds the taxonomy once. */
export async function POST() {
  const handle = await db();
  const applied = await migrate(handle, join(process.cwd(), "db", "migrations"));

  let household = await firstHouseholdId(handle);
  if (!household) {
    household = await createHousehold(handle, "Household");
    await seedCategories(handle, household);
  }

  return NextResponse.json({ ok: true, applied });
}
