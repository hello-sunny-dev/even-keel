import { Heading, Note } from "@/components/ui";
import { currentMonthIn } from "@/lib/dates";
import { listGoals, listSavingsPlans } from "@/lib/db/queries";
import { requireSession } from "@/lib/session";
import { GoalForm, ScenarioLadder } from "./GoalsForm";

export const dynamic = "force-dynamic";

export default async function Goals() {
  const { db, household, settings } = await requireSession();
  const [goals, scenarios] = await Promise.all([
    listGoals(db, household),
    listSavingsPlans(db, household),
  ]);

  const cash = goals.find((g) => g.kind === "cash");
  const netWorth = goals.find((g) => g.kind === "net_worth");
  const thisMonth = currentMonthIn(settings.timeZone);

  return (
    <>
      <Heading
        eyebrow="What we are aiming at"
        title="Goals"
        lede="Two goals, because they answer different questions. Cash is what we can reach; net worth is what we are actually worth."
      />

      <section className="mb-10">
        <p className="eyebrow mb-3">Savings</p>
        <GoalForm
          kind="cash"
          goal={cash}
          thisMonth={thisMonth}
          lede="Money we could spend tomorrow. This is the one the monthly verdict is scored against."
        />
      </section>

      <section className="mb-10">
        <p className="eyebrow mb-3">Net worth</p>
        <GoalForm
          kind="net_worth"
          goal={netWorth}
          thisMonth={thisMonth}
          lede="Everything owned less everything owed — super and property included. Buying an ETF moves cash down and this up, which is why one number could never do both jobs."
        />
      </section>

      <section>
        <p className="eyebrow mb-3">Savings scenarios</p>
        <p className="text-muted mb-3 max-w-prose text-sm">
          Every month is scored against all three, not only the one marked <em>Ours</em> — that one
          decides the headline verdict. A month that clears Minimum and misses Aggressive says
          something a single pass or fail cannot.
        </p>
        <ScenarioLadder scenarios={scenarios} cashGoal={cash} />
        {scenarios.length === 0 && cash && (
          <Note>
            These three are worked out from the savings goal above: Minimum is what actually lands
            on target, and the other two are what getting there sooner costs. Change them to
            whatever is true.
          </Note>
        )}
      </section>
    </>
  );
}
