import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { countUsers } from "@/lib/auth-server";
import { database } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const requested = (await searchParams).next;
  // Only ever bounce back inside this app — an absolute URL here would make
  // the login screen an open redirect.
  const next = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/";

  const accounts = await countUsers(await database());

  if (accounts === 0) {
    return (
      <AuthShell title="Even Keel" lede="Nobody has an account here yet.">
        <Link
          href="/start"
          className="bg-ink text-paper block w-full rounded-lg px-4 py-2 text-sm font-medium"
        >
          Create the first account
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Even Keel"
      footnote={
        <>
          There is no sign-up page. Accounts are created by invitation, so a wrong password and an
          unknown address get the same answer, and this page is never indexed.
        </>
      }
    >
      <LoginForm next={next} />
    </AuthShell>
  );
}
