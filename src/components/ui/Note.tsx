export function Note({
  tone = "plain",
  children,
}: {
  tone?: "plain" | "warn" | "bad";
  children: React.ReactNode;
}) {
  const bar = tone === "warn" ? "var(--oneoff)" : tone === "bad" ? "var(--fail)" : "var(--accent)";
  return (
    <div className="border-rule bg-sunk text-muted flex gap-3 rounded-lg border p-3 text-sm">
      <span className="w-[3px] flex-none rounded-full" style={{ background: bar }} />
      <span className="min-w-0">{children}</span>
    </div>
  );
}
