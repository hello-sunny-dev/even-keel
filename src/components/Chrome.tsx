"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/upload", label: "Upload" },
  { href: "/review", label: "Review" },
  { href: "/one-offs", label: "One-offs" },
  { href: "/trends", label: "Trends" },
  { href: "/plan", label: "Plan" },
];

export function Nav({ reviewCount = 0 }: { reviewCount?: number }) {
  const pathname = usePathname();

  return (
    <nav className="border-line bg-paper/90 sticky top-0 z-20 border-b backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4 py-2">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative shrink-0 rounded-full px-3 py-1.5 text-sm whitespace-nowrap"
              style={{ color: active ? "var(--paper)" : "var(--muted)" }}
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="bg-ink absolute inset-0 rounded-full"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative">
                {item.label}
                {item.href === "/review" && reviewCount > 0 && (
                  <span className="bg-oneoff ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] text-white">
                    {reviewCount}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
        <form action="/api/logout" method="post" className="ml-auto shrink-0 pl-2">
          <button type="submit" className="text-muted hover:text-ink text-sm">
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}

export function Page({ children }: { children: React.ReactNode }) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto max-w-5xl px-4 pt-6 pb-24"
    >
      {children}
    </motion.main>
  );
}

export function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      {subtitle && <p className="text-muted mt-1 max-w-xl text-sm">{subtitle}</p>}
    </header>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`border-line bg-card rounded-xl border p-4 ${className}`}>{children}</div>;
}
