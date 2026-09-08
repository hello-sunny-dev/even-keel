import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { db, hasDatabase } from "@/lib/db/client";
import { seedCategories } from "@/lib/db/queries";

export const runtime = "nodejs";

/** Idempotent: creates the schema if missing and seeds the taxonomy. */
export async function POST() {
  if (!hasDatabase) return NextResponse.json({ error: "DATABASE_URL is not set." }, { status: 503 });
  const schema = await readFile(join(process.cwd(), "db", "schema.sql"), "utf8");
  await db().unsafe(schema);
  await seedCategories();
  return NextResponse.json({ ok: true });
}
