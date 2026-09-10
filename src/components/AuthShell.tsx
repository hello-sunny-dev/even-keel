export function AuthShell({
  title,
  lede,
  children,
  footnote,
}: {
  title: string;
  lede?: string;
  children: React.ReactNode;
  footnote?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-sm py-12 text-center">
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

      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted mt-1 mb-6 text-sm italic">Net worth for two</p>
      {lede && <p className="text-muted mb-5 text-sm">{lede}</p>}

      {children}

      {footnote && <div className="text-faint mt-6 text-xs leading-relaxed">{footnote}</div>}
    </div>
  );
}

export function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-left">
      <span className="eyebrow">{label}</span>
      <input
        {...props}
        className="border-rule-strong bg-sheet mt-1 w-full rounded-lg border px-3 py-2 text-sm"
      />
    </label>
  );
}
