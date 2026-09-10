/**
 * Apply migrations and seed the category taxonomy.
 *
 *   npm run db:setup
 *
 * Safe to run repeatedly: migrations are recorded once, and seeding uses
 * `on conflict do nothing`, so an existing household keeps its edits.
 *
 * With no DATABASE_URL this targets a PGlite database under .pglite/, which is
 * what `npm run dev` uses too — so a fresh clone needs no Postgres at all.
 */
import { join } from "node:path";
import { DEV_PGLITE_DIR } from "../src/lib/db";
import { createPgliteDb } from "../src/lib/db/pglite";
import { migrate } from "../src/lib/db/migrate";
import type { Db } from "../src/lib/db/port";
import { createHousehold, firstHouseholdId, seedCategories } from "../src/lib/db/queries";

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";

let db: Db;
if (url) {
  const { createPostgresDb } = await import("../src/lib/db/postgres");
  db = createPostgresDb(url);
  console.log("Using DATABASE_URL");
} else {
  db = createPgliteDb(process.env.PGLITE_DIR || DEV_PGLITE_DIR);
  console.log(`No DATABASE_URL — using a local PGlite database in ${DEV_PGLITE_DIR}/`);
}

try {
  const applied = await migrate(db, join(process.cwd(), "db", "migrations"));
  console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Migrations already up to date");

  let household = await firstHouseholdId(db);
  if (household) {
    console.log("Household already exists — leaving it alone");
  } else {
    household = await createHousehold(db, "Household");
    await seedCategories(db, household);
    console.log("Created a household and seeded the category taxonomy");
  }
} finally {
  await db.close();
}
