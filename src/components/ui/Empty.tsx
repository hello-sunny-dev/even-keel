export function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-rule-strong bg-sunk rounded-xl border border-dashed p-8 text-center">
      <p className="text-base font-semibold">{title}</p>
      <div className="text-muted mx-auto mt-2 max-w-prose text-sm">{children}</div>
    </div>
  );
}
