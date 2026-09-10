import { describe, expect, it } from "vitest";
import { isPooled } from "@/lib/db/postgres";

/**
 * No live database needed: this is about reading a connection string
 * correctly, and getting it wrong produces an error that only appears when two
 * requests overlap — which is to say, in production and not in testing.
 */
describe("spotting a transaction-mode pooler", () => {
  it("recognises Supabase's pooled connection", () => {
    expect(
      isPooled(
        "postgresql://postgres.abcd:pw@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres",
      ),
    ).toBe(true);
  });

  it("recognises Supabase's direct connection as not pooled", () => {
    expect(isPooled("postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres")).toBe(false);
  });

  it("recognises Neon's pooled host", () => {
    expect(
      isPooled("postgresql://user:pw@ep-cool-name-123456-pooler.ap-southeast-2.aws.neon.tech/db"),
    ).toBe(true);
  });

  it("takes the flag people are told to add", () => {
    expect(isPooled("postgresql://user:pw@host:5432/db?pgbouncer=true")).toBe(true);
  });

  it("leaves a plain local database alone", () => {
    expect(isPooled("postgresql://postgres@localhost:5432/even_keel")).toBe(false);
    // Port 6543 has to be the port, not part of a password or a database name.
    expect(isPooled("postgresql://user:p6543@host:5432/db")).toBe(false);
  });
});
