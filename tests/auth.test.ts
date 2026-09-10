import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSessionToken, readSessionToken, timingSafeEqual, SESSION_MAX_AGE } from "@/lib/auth";
import {
  changePassword,
  countUsers,
  createAccount,
  createInvite,
  findAccountByEmail,
  findUsableInvite,
  hashPassword,
  isRateLimited,
  listHouseholdMembers,
  markInviteAccepted,
  passwordHashFor,
  recordLoginAttempt,
  revokeInvite,
  verifyPassword,
  RATE_LIMIT,
} from "@/lib/auth-server";
import type { Db } from "@/lib/db/port";
import { freshDb } from "./support/db";

const SECRET = "a-secret-for-the-tests";

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
});

let open: Db | null = null;
afterEach(async () => {
  await open?.close();
  open = null;
});

describe("passwords", () => {
  it("never stores the password itself", async () => {
    const hash = await hashPassword("correct-horse-battery");

    expect(hash).not.toContain("correct-horse-battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
  });

  it("gives every hash its own salt, so two people with one password differ", async () => {
    const [a, b] = await Promise.all([
      hashPassword("same-password"),
      hashPassword("same-password"),
    ]);

    expect(a).not.toBe(b);
    expect(await verifyPassword("same-password", a)).toBe(true);
    expect(await verifyPassword("same-password", b)).toBe(true);
  });

  it("rejects the wrong one, and a missing hash, without throwing", async () => {
    const hash = await hashPassword("the-real-one");

    expect(await verifyPassword("not-it", hash)).toBe(false);
    // An account that does not exist has no hash. It must still take the same
    // path, or how fast the answer comes back says whether an address is
    // registered.
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", "garbage")).toBe(false);
  });
});

describe("session tokens", () => {
  it("round-trips the claims it was given", async () => {
    const token = await createSessionToken({ userId: "user-1", version: 3 });

    expect(await readSessionToken(token)).toEqual({ userId: "user-1", version: 3 });
  });

  it("refuses a token whose claims were tampered with", async () => {
    const token = await createSessionToken({ userId: "user-1", version: 1 });
    const [id, version, expires, signature] = token.split(".");

    // Claim to be someone else, keeping the signature.
    expect(await readSessionToken(`user-2.${version}.${expires}.${signature}`)).toBeNull();
    // Claim a different version — this is what a password change invalidates.
    expect(await readSessionToken(`${id}.99.${expires}.${signature}`)).toBeNull();
    // Award yourself a longer expiry.
    expect(
      await readSessionToken(`${id}.${version}.${Number(expires) + 1e9}.${signature}`),
    ).toBeNull();
  });

  it("refuses an expired token", async () => {
    const issued = Date.now() - (SESSION_MAX_AGE + 60) * 1000;
    const token = await createSessionToken({ userId: "user-1", version: 1 }, issued);

    expect(await readSessionToken(token)).toBeNull();
  });

  it("refuses everything once the secret changes", async () => {
    const token = await createSessionToken({ userId: "user-1", version: 1 });
    process.env.SESSION_SECRET = "a-different-secret";

    expect(await readSessionToken(token)).toBeNull();
  });

  it("refuses to sign in production without a secret, but not in development", async () => {
    delete process.env.SESSION_SECRET;
    const was = process.env.NODE_ENV;

    // The development fallback is a convenience for a fresh clone.
    expect(await createSessionToken({ userId: "user-1", version: 1 })).toContain("user-1");

    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
      writable: true,
      enumerable: true,
    });
    try {
      await expect(createSessionToken({ userId: "user-1", version: 1 })).rejects.toThrow(
        "SESSION_SECRET",
      );
    } finally {
      Object.defineProperty(process.env, "NODE_ENV", {
        value: was,
        configurable: true,
        writable: true,
        enumerable: true,
      });
    }
  });

  it("compares without revealing where two strings diverge", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

describe("accounts", () => {
  it("signs in with the right password and not the wrong one", async () => {
    const { db, household } = await freshDb();
    open = db;
    await createAccount(db, {
      householdId: household,
      email: "Jamie@Example.com",
      displayName: "Jamie",
      password: "correct-horse-battery",
    });

    // Matched case-insensitively; nobody remembers how they typed it.
    const account = await findAccountByEmail(db, "jamie@example.com");
    expect(account?.displayName).toBe("Jamie");

    const hash = await passwordHashFor(db, account!.id);
    expect(await verifyPassword("correct-horse-battery", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("bumps the session version on a password change, stranding old tokens", async () => {
    const { db, household } = await freshDb();
    open = db;
    const account = await createAccount(db, {
      householdId: household,
      email: "jamie@example.com",
      displayName: "Jamie",
      password: "the-old-passphrase",
    });
    const token = await createSessionToken({
      userId: account.id,
      version: account.sessionVersion,
    });

    const version = await changePassword(db, account.id, "the-new-passphrase");

    expect(version).toBe(account.sessionVersion + 1);
    // The old token still verifies its own signature — it is the comparison
    // against the stored version that turns it away.
    const claims = await readSessionToken(token);
    expect(claims?.version).toBe(account.sessionVersion);
    expect(claims!.version).not.toBe(version);
  });
});

describe("rate limiting", () => {
  it("stops a run of wrong guesses", async () => {
    const { db } = await freshDb();
    open = db;

    expect(await isRateLimited(db, "jamie@example.com")).toBe(false);
    for (let i = 0; i < RATE_LIMIT.maxFailures; i++) {
      await recordLoginAttempt(db, "jamie@example.com", false);
    }

    expect(await isRateLimited(db, "jamie@example.com")).toBe(true);
    // Counted per address, so one person cannot lock everyone else out.
    expect(await isRateLimited(db, "tony@example.com")).toBe(false);
  });

  it("ignores successful sign-ins", async () => {
    const { db } = await freshDb();
    open = db;

    for (let i = 0; i < RATE_LIMIT.maxFailures + 4; i++) {
      await recordLoginAttempt(db, "jamie@example.com", true);
    }

    expect(await isRateLimited(db, "jamie@example.com")).toBe(false);
  });
});

describe("invites", () => {
  async function withOwner() {
    const { db, household } = await freshDb();
    const owner = await createAccount(db, {
      householdId: household,
      email: "jamie@example.com",
      displayName: "Jamie",
      password: "the-first-passphrase",
    });
    return { db, household, owner };
  }

  it("puts a partner in the same household", async () => {
    const { db, household, owner } = await withOwner();
    open = db;

    const invite = await createInvite(db, {
      kind: "join",
      householdId: household,
      createdBy: owner.id,
    });
    const tony = await createAccount(db, {
      householdId: invite.householdId!,
      email: "tony@example.com",
      displayName: "Taylor",
      password: "the-second-passphrase",
    });
    await markInviteAccepted(db, invite.token, tony.id);

    const members = await listHouseholdMembers(db, household);
    expect(members.map((m) => m.displayName).sort()).toEqual(["Jamie", "Taylor"]);
  });

  it("works once, so a leaked link cannot keep letting people in", async () => {
    const { db, household, owner } = await withOwner();
    open = db;
    const invite = await createInvite(db, {
      kind: "join",
      householdId: household,
      createdBy: owner.id,
    });

    expect(await findUsableInvite(db, invite.token)).not.toBeNull();
    await markInviteAccepted(db, invite.token, owner.id);
    expect(await findUsableInvite(db, invite.token)).toBeNull();
  });

  it("expires, and can be revoked before it does", async () => {
    const { db, household, owner } = await withOwner();
    open = db;

    const expired = await createInvite(db, {
      kind: "join",
      householdId: household,
      createdBy: owner.id,
      days: -1,
    });
    expect(await findUsableInvite(db, expired.token)).toBeNull();

    const live = await createInvite(db, {
      kind: "join",
      householdId: household,
      createdBy: owner.id,
    });
    await revokeInvite(db, live.token, household);
    expect(await findUsableInvite(db, live.token)).toBeNull();
  });

  it("leaves the household standing when the accounts are deleted", async () => {
    // The documented way out of being locked out (docs/RUNBOOK.md): remove the
    // accounts so /start reopens. It must not take the figures with it, and the
    // invites that reference those accounts must not block the delete.
    const { db, household, owner } = await withOwner();
    open = db;
    await createInvite(db, { kind: "join", householdId: household, createdBy: owner.id });

    await db.query("delete from users where household_id = $1", [household]);

    expect(await countUsers(db)).toBe(0);
    const [row] = await db.query<{ n: number }>(
      "select count(*)::int as n from households where id = $1",
      [household],
    );
    expect(row.n).toBe(1);
  });

  it("carries no household when it is for someone starting their own", async () => {
    const { db, owner } = await withOwner();
    open = db;

    const invite = await createInvite(db, {
      kind: "new_household",
      householdId: null,
      createdBy: owner.id,
    });

    expect(invite.householdId).toBeNull();
    expect(await countUsers(db)).toBe(1);
  });
});
