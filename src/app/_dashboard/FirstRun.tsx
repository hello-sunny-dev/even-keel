import Link from "next/link";
import { Empty, Heading } from "@/components/ui";

export function FirstRun({
  hasGoal,
  hasScenarios,
  hasAccounts,
}: {
  hasGoal: boolean;
  hasScenarios: boolean;
  hasAccounts: boolean;
}) {
  const steps = [
    { done: hasGoal, label: "Set what you are aiming at", href: "/goals", cta: "Goals" },
    { done: hasScenarios, label: "Pick the three scenarios", href: "/goals", cta: "Goals" },
    { done: hasAccounts, label: "Add accounts and balances", href: "/assets", cta: "Net worth" },
    { done: false, label: "Import a statement", href: "/add", cta: "Add transactions" },
  ];

  return (
    <>
      <Heading eyebrow="Are we on track?" title="Even Keel" />
      <Empty title="Nothing to score yet">
        Everything on this page is worked out from what you put in, so it fills in as soon as there
        is some. Four steps:
        <ol className="mx-auto mt-4 max-w-xs space-y-2 text-left">
          {steps.map((step) => (
            <li key={step.label} className="flex items-baseline gap-2 text-sm">
              <span aria-hidden style={{ color: step.done ? "var(--pass)" : "var(--faint)" }}>
                {step.done ? "✓" : "○"}
              </span>
              <span style={{ textDecoration: step.done ? "line-through" : undefined }}>
                {step.label}
              </span>
              {!step.done && (
                <Link href={step.href} className="ml-auto underline">
                  {step.cta}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </Empty>
    </>
  );
}
