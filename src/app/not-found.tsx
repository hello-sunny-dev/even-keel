import Link from "next/link";
import { Empty, Heading } from "@/components/ui";

/**
 * A 404 that says which app it belongs to.
 *
 * Next's default is an unstyled page that looks identical in every project, so
 * a 404 on localhost tells you nothing about whether you are even looking at
 * the right dev server. This one is unmistakably Even Keel.
 */
export default function NotFound() {
  return (
    <>
      <Heading eyebrow="Even Keel" title="No such page" />
      <Empty title="404">
        This is Even Keel, and this address is not part of it.
        <div className="mt-4 flex flex-wrap justify-center gap-3 text-sm">
          <Link href="/" className="underline">
            Dashboard
          </Link>
          <Link href="/add" className="underline">
            Add transactions
          </Link>
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </div>
      </Empty>
    </>
  );
}
