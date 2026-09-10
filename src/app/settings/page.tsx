import { headers } from "next/headers";
import { Heading, Note } from "@/components/ui";
import { listHouseholdMembers, listOpenInvites } from "@/lib/auth-server";
import { requireSession } from "@/lib/session";
import { ChangePassword, Invites } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const { db, account, household } = await requireSession();
  const [members, invites, headerList] = await Promise.all([
    listHouseholdMembers(db, household),
    listOpenInvites(db, household),
    headers(),
  ]);

  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";

  return (
    <>
      <Heading eyebrow="Account" title="Settings" />

      <section className="mb-10">
        <p className="eyebrow mb-2">Signed in as</p>
        <p className="text-sm">
          {account.displayName} · <span className="text-muted">{account.email}</span>
        </p>
        <form action="/api/auth/logout" method="post" className="mt-3">
          <button type="submit" className="text-sm underline">
            Sign out
          </button>
        </form>
      </section>

      <section className="mb-10">
        <p className="eyebrow mb-2">In this household</p>
        <ul className="mb-3 space-y-1 text-sm">
          {members.map((m) => (
            <li key={m.id}>
              {m.displayName} <span className="text-muted">{m.email}</span>
              {m.id === account.id && <span className="text-faint ml-2 text-xs">you</span>}
            </li>
          ))}
        </ul>
        <Note>
          Everyone in a household sees the same transactions, goals and balances. Someone who should
          keep separate figures wants their own household instead.
        </Note>
      </section>

      <section className="mb-10">
        <p className="eyebrow mb-3">Invites</p>
        <Invites initial={invites} origin={`${protocol}://${host}`} />
      </section>

      <section>
        <p className="eyebrow mb-3">Change password</p>
        <ChangePassword />
        <p className="text-faint mt-3 max-w-prose text-xs">
          Changing it signs out every other device immediately — the sessions are keyed to the
          password, so an old one stops working the moment this succeeds.
        </p>
      </section>
    </>
  );
}
