import { Verdict } from "@/components/charts";
import { Money } from "@/components/ui";
import type { scoreScenarios } from "@/lib/goals";

export function ScenarioLadder({ ladder }: { ladder: ReturnType<typeof scoreScenarios> }) {
  return (
    <section className="mb-8">
      <p className="eyebrow mb-2">Against every scenario</p>
      <ul className="border-rule-strong border-t">
        {ladder.map((s) => (
          <li
            key={s.scenario.id}
            className="border-rule flex items-baseline justify-between gap-3 border-b py-2.5"
          >
            <span className="flex items-baseline gap-2 text-sm">
              {s.scenario.name}
              {s.scenario.active && <span className="text-faint text-xs">ours</span>}
            </span>
            <span className="flex items-baseline gap-3">
              <span className="text-muted text-xs">
                needs <Money amount={s.required} />
              </span>
              <span className="tabular text-sm">
                <Money amount={s.vsPlan} signed tone />
              </span>
              <Verdict good={s.passed}>{s.passed ? "Cleared" : "Short"}</Verdict>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
