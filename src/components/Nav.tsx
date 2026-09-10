"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

/**
 * Four destinations on a phone and everything on a desktop.
 *
 * The phone is the primary device. A row of seven pills that scrolls
 * horizontally hides three destinations behind a gesture with nothing on
 * screen to say they are there, so the rest live behind More — which at least
 * announces itself.
 */
const PRIMARY = [
  { href: "/", label: "Home" },
  { href: "/add", label: "Add" },
  { href: "/review", label: "Review" },
];

const MORE = [
  { href: "/transactions", label: "Ledger" },
  { href: "/goals", label: "Goals" },
  { href: "/settings", label: "Settings" },
];

const GATE = ["/login", "/start", "/join"];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (GATE.includes(pathname)) return null;

  const moreActive = MORE.some((item) => isActive(pathname, item.href));

  return (
    <nav className="border-rule bg-paper/95 fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur sm:static sm:border-t-0 sm:border-b sm:bg-transparent sm:backdrop-blur-none">
      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-ink/20 fixed inset-0 -z-10 sm:hidden"
            />
            <motion.ul
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              className="border-rule bg-paper mx-4 mb-2 overflow-hidden rounded-xl border sm:hidden"
            >
              {MORE.map((item) => (
                <li key={item.href} className="border-rule border-b last:border-b-0">
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={isActive(pathname, item.href) ? "page" : undefined}
                    className="block px-4 py-3 text-sm"
                    style={{ color: isActive(pathname, item.href) ? "var(--ink)" : "var(--muted)" }}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </motion.ul>
          </>
        )}
      </AnimatePresence>

      <div className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-2 sm:px-6">
        <span className="hidden pr-4 text-sm font-semibold tracking-tight sm:block">Even Keel</span>

        {[...PRIMARY, ...MORE].map((item) => {
          const active = isActive(pathname, item.href);
          const secondary = MORE.some((m) => m.href === item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex-1 rounded-full px-3 py-2 text-center text-sm sm:flex-none ${
                secondary ? "hidden sm:block" : ""
              }`}
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

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="relative flex-1 rounded-full px-3 py-2 text-center text-sm sm:hidden"
          style={{ color: moreActive || open ? "var(--ink)" : "var(--muted)" }}
        >
          More
        </button>
      </div>
    </nav>
  );
}
