import { isConfigured } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const requested = (await searchParams).next;
  // Only ever bounce back to a path inside this app — an absolute URL here
  // would turn the login screen into an open redirect.
  const next = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/";

  return (
    <div className="mx-auto max-w-xs py-16 text-center">
      <div
        className="border-rule-strong mx-auto mb-5 grid h-12 w-12 place-items-center rounded-xl border"
        aria-hidden="true"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3v13" />
          <path d="M5 16h14l-7 5z" />
          <path d="M9 7.5h6" />
        </svg>
      </div>

      <h1 className="text-xl font-semibold tracking-tight">Even Keel</h1>
      <p className="text-muted mt-1 mb-6 text-sm italic">Net worth for two</p>

      {isConfigured() ? (
        <LoginForm next={next} />
      ) : (
        <p className="border-rule bg-sunk text-muted rounded-lg border p-3 text-sm">
          No <code className="tabular">APP_PASSWORD</code> is set on the server, so there is nothing
          to sign in with. Set one in <code className="tabular">.env.local</code> and restart, or
          unset it entirely to work without a gate locally.
        </p>
      )}

      <p className="text-faint mt-6 text-xs leading-relaxed">
        Two accounts, seeded by hand — there is no registration route to find. A wrong password and
        an unknown visitor get the same answer, and the page is never indexed.
      </p>
    </div>
  );
}
