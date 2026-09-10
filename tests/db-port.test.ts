import { afterEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/port";
import { freshDb } from "./support/db";

let open: Db | null = null;
afterEach(async () => {
  await open?.close();
  open = null;
});

describe("what the driver hands back", () => {
  it("gives numbers as numbers and dates as strings, because the query casts", async () => {
    // Uncast, postgres.js returns numeric as a string and date as a Date,
    // while PGlite returns int8 as a BigInt. A `query<T>` generic would simply
    // lie about all three.
    const { db, household } = await freshDb();
    open = db;

    const [row] = await db.query<{ amount: number; day: string; n: number }>(
      `select $1::numeric::float8 as amount, $2::date::text as day, count(*)::int as n
         from households where id = $3`,
      [1234.56, "2025-03-05", household],
    );

    expect(typeof row.amount).toBe("number");
    expect(row.amount).toBe(1234.56);
    expect(typeof row.day).toBe("string");
    expect(row.day).toBe("2025-03-05");
    expect(typeof row.n).toBe("number");
  });
});

describe("transactions", () => {
  it("rolls everything back when the callback throws", async () => {
    const { db, household } = await freshDb();
    open = db;

    await expect(
      db.transaction(async (tx) => {
        await tx.query(`update categories set name = 'Changed' where household_id = $1`, [
          household,
        ]);
        throw new Error("no");
      }),
    ).rejects.toThrow("no");

    const [row] = await db.query<{ n: number }>(
      `select count(*)::int as n from categories where household_id = $1 and name = 'Changed'`,
      [household],
    );
    expect(row.n).toBe(0);
  });

  it("commits when it does not", async () => {
    const { db, household } = await freshDb();
    open = db;

    await db.transaction(async (tx) => {
      await tx.query(
        `update categories set target_monthly = 320 where household_id = $1 and id = $2`,
        [household, "food-groceries"],
      );
    });

    const [row] = await db.query<{ target: number }>(
      `select target_monthly::float8 as target from categories
        where household_id = $1 and id = $2`,
      [household, "food-groceries"],
    );
    expect(row.target).toBe(320);
  });

  it("nests without hanging, so a helper can open one inside another", async () => {
    const { db, household } = await freshDb();
    open = db;

    await db.transaction(async (tx) => {
      await tx.transaction(async (inner) => {
        await inner.query(`update households set name = 'Nested' where id = $1`, [household]);
      });
    });

    const [row] = await db.query<{ name: string }>("select name from households where id = $1", [
      household,
    ]);
    expect(row.name).toBe("Nested");
  });

  it("treats a nested rollback as rolling back the whole thing", async () => {
    // PGlite cannot open a second transaction on its single connection, so a
    // nested call joins the outer one rather than taking a savepoint. Stated
    // as a test because it differs from postgres.js and would otherwise
    // surprise someone relying on partial rollback.
    const { db, household } = await freshDb();
    open = db;

    await expect(
      db.transaction(async (tx) => {
        await tx.query(`update households set name = 'Outer' where id = $1`, [household]);
        await tx.transaction(async (inner) => {
          await inner.query(`update households set name = 'Inner' where id = $1`, [household]);
          throw new Error("inner fails");
        });
      }),
    ).rejects.toThrow("inner fails");

    const [row] = await db.query<{ name: string }>("select name from households where id = $1", [
      household,
    ]);
    expect(row.name).toBe("Test Household");
  });
});

describe("migrations", () => {
  it("apply once and are recorded", async () => {
    const { join } = await import("node:path");
    const { readdir } = await import("node:fs/promises");
    const { db } = await freshDb();
    open = db;

    const names = await db.query<{ name: string }>(
      "select name from schema_migrations order by name",
    );

    // Named against the directory rather than a hand-written list: adding a
    // migration should not need this test edited, only the runner to still
    // apply every file it finds, in order.
    const files = (await readdir(join(process.cwd(), "db", "migrations")))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    expect(files.length).toBeGreaterThan(0);
    expect(names.map((r) => r.name)).toEqual(files);
  });

  it("are a no-op the second time", async () => {
    const { join } = await import("node:path");
    const { migrate } = await import("@/lib/db/migrate");
    const { db } = await freshDb();
    open = db;

    const ran = await migrate(db, join(process.cwd(), "db", "migrations"));

    expect(ran).toEqual([]);
  });
});
