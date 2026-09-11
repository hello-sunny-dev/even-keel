import { expect, test } from "@playwright/test";
import { ACCOUNT, STATE } from "./account";

/**
 * Changing a password has to end the sessions it was protecting.
 *
 * The session token carries a version; a change bumps it, and the middleware
 * cannot reach the database to check. So this runs last, in its own browser,
 * and asserts that the cookie saved at the start of the run is no longer good
 * enough — which is the only way to tell the version check from a comment.
 */
const NEXT = "a-different-long-password-entirely";

test("changing the password signs the old session out", async ({ browser }) => {
  const old = await browser.newContext({ storageState: STATE });
  const stale = await old.newPage();
  await stale.goto("/");
  await expect(stale.getByRole("heading", { level: 1 })).toBeVisible();

  const fresh = await browser.newContext({ storageState: STATE });
  const page = await fresh.newPage();
  await page.goto("/settings");
  await page.getByLabel("Current password").fill(ACCOUNT.password);
  await page.getByLabel("New password").fill(NEXT);
  await page.getByRole("button", { name: /change password/i }).click();
  // The message itself, not any alert: the settings page has more than one
  // thing that can speak, and waiting for whichever spoke first let the test
  // walk on before the change had landed.
  await expect(page.getByText(/password changed/i)).toBeVisible();

  // The other browser still holds the cookie it was given before the change.
  await stale.goto("/transactions");
  await expect(stale).toHaveURL(/\/login/);

  await old.close();
  await fresh.close();
});
