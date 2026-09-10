"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * A bottom bar on a phone and a top row on a desktop. The phone is the
 * primary device, and a horizontally scrolling pill row would push half the
 * destinations off screen with nothing to say they were there.
 */
const ITEMS = [
  { href: "/", label: "Home" },
  { href: "/add", label: "Add" },
  { href: "/transactions", label: "Ledger" },
  { href: "/review", label: "Review" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="border-rule bg-paper/95 fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur sm:static sm:border-t-0 sm:border-b sm:bg-transparent sm:backdrop-blur-none">
      <div className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-2 sm:px-6">
        <span className="hidden pr-4 text-sm font-semibold tracking-tight sm:block">Even Keel</span>
        {ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="relative flex-1 rounded-full px-3 py-2 text-center text-sm sm:flex-none"
              style={{ color: active ? "var(--paper)" : "var(--muted)" }}
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="bg-ink absolute inset-0 rounded-full"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
