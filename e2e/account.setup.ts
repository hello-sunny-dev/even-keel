import { expect, test as setup } from "@playwright/test";
import { ACCOUNT, STATE } from "./account";

setup("the first visit creates the household's first account", async ({ page }) => {
  await page.goto("/start");

  await page.getByLabel("Your name").fill(ACCOUNT.name);
  await page.getByLabel("Email").fill(ACCOUNT.email);
  await page.getByLabel("Password", { exact: true }).fill(ACCOUNT.password);
  await page.getByLabel("Household name").fill(ACCOUNT.household);
  await page.getByRole("button", { name: /create/i }).click();

  await page.waitForURL("/");
  // Nothing is in the ledger, so the dashboard has to say that rather than
  // render a month of zeroes as though it were a real month.
  await expect(page.getByText(/nothing to score yet/i)).toBeVisible();

  await page.context().storageState({ path: STATE });
});
