import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { findUsableInvite } from "@/lib/auth-server";
import { database } from "@/lib/session";
import { AccountForm } from "../start/StartForm";

export const dynamic = "force-dynamic";

export default async function Join({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token ?? "";
  const invite = token ? await findUsableInvite(await database(), token) : null;

  if (!invite) {
    return (
      <AuthShell title="Even Keel" lede="This invite link is not valid any more.">
        <p className="border-rule bg-sunk text-muted rounded-lg border p-3 text-sm">
          Invites expire, and each one can only be used once. Ask whoever sent it for a new link.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm underline">
          Sign in instead
        </Link>
      </AuthShell>
    );
  }

  const joining = invite.kind === "join";

  return (
    <AuthShell
      title={joining ? "Join the household" : "Start your household"}
      lede={
        joining
          ? "You will share the same accounts, transactions and goals as whoever invited you."
          : "This invite creates a household of your own — separate figures, nothing shared."
      }
      footnote={invite.note ? `“${invite.note}”` : undefined}
    >
      <AccountForm
        endpoint="/api/auth/join"
        token={invite.token}
        askHousehold={!joining}
        verb={joining ? "Join" : "Create household"}
      />
    </AuthShell>
  );
}
