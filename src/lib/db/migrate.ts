import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Db } from "./port";

/**
 * Numbered migrations, applied in order, each recorded once.
 *
 * A single `schema.sql` applied by hand works exactly until the schema
 * changes, which it will — and by then there is real data in the database and
 * no record of what has already been run.
 */
export async function migrate(db: Db, dir: string): Promise<string[]> {
  await db.query(`
    create table if not exists schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const applied = new Set(
    (await db.query<{ name: string }>("select name from schema_migrations")).map((r) => r.name),
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const ran: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(dir, file), "utf8");
    // Each migration runs as one script. PGlite wraps a multi-statement script
    // in an implicit transaction, so a half-applied schema change is not a
    // state either driver can land in.
    await db.exec(sql);
    await db.query("insert into schema_migrations (name) values ($1)", [file]);
    ran.push(file);
  }

  return ran;
}
