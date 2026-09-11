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
/**
 * Run with `--conditions=react-server`, which the npm script supplies.
 *
 * `db/postgres.ts` carries `import "server-only"` — a guard that stops the
 * driver being pulled into a browser bundle. That package throws outside a
 * React Server Component, and a script is not one, so applying the schema to a
 * real database failed on the import with "This module cannot be imported from
 * a Client Component module" and never reached Postgres at all. The condition
 * resolves `server-only` to the empty module it ships for exactly this case,
 * which keeps the guard where it belongs without breaking the one tool that
 * legitimately needs the driver outside Next.
 */
import { join } from "node:path";
import { DEV_PGLITE_DIR } from "../src/lib/db";
import { createPgliteDb } from "../src/lib/db/pglite";
import { migrate } from "../src/lib/db/migrate";
import type { Db } from "../src/lib/db/port";
import { createHousehold, firstHouseholdId, seedCategories } from "../src/lib/db/queries";

/**
 * Load `.env.local` the way the app does.
 *
 * `next dev` and `next build` read it; a plain script does not. So putting a
 * connection string in `.env.local` and running this would quietly apply the
 * schema to the local PGlite database instead — and the app, which does read
 * the file, would then connect to Postgres and find no tables at all. The
 * failure arrives one step later than the mistake, which is the worst place
 * for it.
 */
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(join(process.cwd(), file));
  } catch {
    // Not there, which is fine — the variables may come from the environment.
  }
}

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";

let db: Db;
if (url) {
  const { createPostgresDb } = await import("../src/lib/db/postgres");
  db = createPostgresDb(url);
  // Says which database without printing the credential.
  const host = /@([^/:?]+)/.exec(url)?.[1] ?? "the configured host";
  console.log(`Using DATABASE_URL — ${host}`);
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
