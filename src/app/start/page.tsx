import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { countUsers } from "@/lib/auth-server";
import { database } from "@/lib/session";
import { AccountForm } from "./StartForm";

export const dynamic = "force-dynamic";

/**
 * The bootstrap, and only the bootstrap.
 *
 * It closes itself the moment an account exists, so this is not a sign-up
 * route someone can find later — everybody after the first arrives with an
 * invite.
 */
export default async function Start() {
  const accounts = await countUsers(await database());

  if (accounts > 0) {
    return (
      <AuthShell title="Even Keel" lede="This app already has an account.">
        <p className="border-rule bg-sunk text-muted rounded-lg border p-3 text-sm">
          There is no open sign-up. If you should have access, ask for an invite link.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm underline">
          Sign in instead
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Start your household"
      lede="This creates the first account and the household it keeps. You can invite someone into it afterwards."
      footnote="This page stops working as soon as this account exists."
    >
      <AccountForm endpoint="/api/auth/start" askHousehold verb="Create account" />
    </AuthShell>
  );
}
