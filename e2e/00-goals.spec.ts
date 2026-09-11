import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

/**
 * Nothing on the dashboard means anything until there is something to be
 * measured against. This runs first so every later spec has a goal, three
 * scenarios and therefore a verdict to read.
 */
test("setting a savings goal gives the dashboard something to score", async ({ page }) => {
  await page.goto("/goals");

  const savings = page.locator("section").filter({ hasText: "Savings" }).first();
  await savings.getByLabel("Reach").fill("120000");
  await savings.getByLabel("Within (months)").fill("36");
  await savings.getByLabel("Already there").fill("41000");
  // "Set goal" the first time, "Update goal" after that.
  await savings.getByRole("button", { name: /(set|update) goal/i }).click();

  await expect(page.getByText(/that is \$/i).first()).toBeVisible();
});

test("three scenarios, one of them ours", async ({ page }) => {
  await page.goto("/goals");

  const names = page.getByLabel("Name");
  const amounts = page.getByLabel("A month");
  await expect(names).toHaveCount(3);

  for (const [i, amount] of ["1800", "2400", "3200"].entries()) {
    await amounts.nth(i).fill(amount);
  }
  await page.getByRole("radio").nth(1).check();
  await page.getByRole("button", { name: /save scenarios/i }).click();

  // They survive the round trip. Whether the dashboard scores a month against
  // them is 03-dashboard's job — there is nothing in the ledger yet.
  await page.reload();
  await expect(page.getByLabel("A month").nth(1)).toHaveValue("2400");
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
});
