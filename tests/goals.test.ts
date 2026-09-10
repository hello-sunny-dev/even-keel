import { afterEach, describe, expect, it } from "vitest";
import { goalProgress, scoreScenarios, suggestScenarios, type Goal } from "@/lib/goals";
import { listGoals, listSavingsPlans, saveGoal, saveSavingsPlans } from "@/lib/db/queries";
import type { Db } from "@/lib/db/port";
import { freshDb } from "./support/db";

let open: Db | null = null;
afterEach(async () => {
  await open?.close();
  open = null;
});

const fields: Omit<Goal, "id"> = {
  kind: "cash",
  name: "House deposit",
  targetAmount: 60000,
  targetMonths: 24,
  openingBalance: 12000,
  annualRate: 0,
  startMonth: "2025-01",
};

const goal: Goal = { id: "g1", ...fields };

describe("where a goal says we should be by now", () => {
  it("measures against the contribution the goal implies", () => {
    // $48,000 to find over 24 months at no interest is $2,000 a month, so six
    // months in the line sits at $24,000.
    const p = goalProgress(goal, 24000, "2025-06");

    expect(p.plannedMonthly).toBe(2000);
    expect(p.monthsElapsed).toBe(6);
    expect(p.expected).toBe(24000);
    expect(p.ahead).toBe(0);
    expect(p.onTrack).toBe(true);
    expect(p.percent).toBe(25); // $12,000 of the $48,000 journey
  });

  it("compounds the expected line when the goal carries a rate", () => {
    // With interest the line is not straight, and a straight one would call a
    // household behind when it is exactly on plan.
    const earning = { ...goal, annualRate: 0.05 };
    const p = goalProgress(earning, 24000, "2025-06");

    expect(p.plannedMonthly).toBeLessThan(2000);
    expect(p.expected).toBeGreaterThan(23000);
    expect(p.expected).toBeLessThan(24000);
    expect(p.onTrack).toBe(true);
  });

  it("says what it now takes to still land on target", () => {
    // Six months in and $6,000 short: the remaining 18 months have to carry
    // more than the original $2,000.
    const p = goalProgress(goal, 18000, "2025-06");

    expect(p.ahead).toBe(-6000);
    expect(p.onTrack).toBe(false);
    expect(p.requiredMonthly).toBe(2333.33); // (60,000 − 18,000) / 18
  });

  it("stops the clock at the target date rather than running past it", () => {
    const p = goalProgress(goal, 61000, "2028-06");

    expect(p.monthsElapsed).toBe(24);
    expect(p.monthsRemaining).toBe(0);
    expect(p.reached).toBe(true);
    expect(p.requiredMonthly).toBe(0);
    expect(p.percent).toBe(100); // clamped; past the target is still "there"
  });

  it("handles a goal that has not started yet", () => {
    const p = goalProgress(goal, 12000, "2024-11");

    expect(p.monthsElapsed).toBe(0);
    expect(p.expected).toBe(12000);
    expect(p.percent).toBe(0);
  });
});

describe("every month is scored against every scenario", () => {
  const scenarios = [
    { id: "c", name: "Aggressive", monthlyAmount: 3000, note: null, active: false },
    { id: "a", name: "Minimum", monthlyAmount: 2000, note: null, active: true },
    { id: "b", name: "Moderate", monthlyAmount: 2500, note: null, active: false },
  ];

  it("orders the ladder and marks which rungs a month cleared", () => {
    const scores = scoreScenarios(2600, scenarios);

    expect(scores.map((s) => s.scenario.name)).toEqual(["Minimum", "Moderate", "Aggressive"]);
    expect(scores.map((s) => s.passed)).toEqual([true, true, false]);
    expect(scores[2].vsPlan).toBe(-400);
  });

  it("suggests a ladder anchored to what the goal actually requires", () => {
    expect(suggestScenarios(goal)).toEqual([
      { name: "Minimum", monthlyAmount: 2000 },
      { name: "Moderate", monthlyAmount: 2500 },
      { name: "Aggressive", monthlyAmount: 3000 },
    ]);
  });
});

describe("storing them", () => {
  it("keeps one active goal per kind and replaces it on edit", async () => {
    const { db, household } = await freshDb();
    open = db;
    await saveGoal(db, household, fields);
    await saveGoal(db, household, { ...fields, targetAmount: 90000 });
    await saveGoal(db, household, { ...fields, kind: "net_worth", name: "Net worth" });

    const goals = await listGoals(db, household);
    expect(goals.map((g) => g.kind).sort()).toEqual(["cash", "net_worth"]);
    expect(goals.find((g) => g.kind === "cash")?.targetAmount).toBe(90000);
  });

  it("replaces the whole ladder and allows exactly one active scenario", async () => {
    const { db, household } = await freshDb();
    open = db;

    await saveSavingsPlans(db, household, [
      { name: "Minimum", monthlyAmount: 2000, active: false },
      { name: "Moderate", monthlyAmount: 2500, active: true },
      { name: "Aggressive", monthlyAmount: 3000, active: false },
    ]);
    await saveSavingsPlans(db, household, [
      { name: "Minimum", monthlyAmount: 2200, active: true },
      { name: "Moderate", monthlyAmount: 2700, active: false },
    ]);

    const plans = await listSavingsPlans(db, household);
    expect(plans.map((p) => p.monthlyAmount)).toEqual([2200, 2700]);
    expect(plans.filter((p) => p.active)).toHaveLength(1);
  });

  it("refuses a second active scenario", async () => {
    const { db, household } = await freshDb();
    open = db;

    await expect(
      saveSavingsPlans(db, household, [
        { name: "Minimum", monthlyAmount: 2000, active: true },
        { name: "Moderate", monthlyAmount: 2500, active: true },
      ]),
    ).rejects.toThrow(/savings_plans_one_active/);
  });
});
