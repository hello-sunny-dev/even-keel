# End-to-end

```
npm run e2e
```

Builds the app, starts it on port 3210 against a disposable PGlite database in
`.pglite-e2e/`, and drives it with Playwright.

**A production build, not `next dev`.** The CSP, the nonce and the security
headers only behave as they ship in a production build, so a dev server would
pass tests the deployed app could fail.

**One worker, in file order.** Every spec drives the same household against one
database, so the numeric prefixes are the running order and they matter:
`00-goals` sets what the dashboard is scored against, `01-import` puts
transactions in the ledger that `02-review` tags, and `09-password` changes the
password, which ends the session every earlier spec was using. That last one is
its own project, depending on the others, so nothing can be scheduled after it.

The first run creates the account (`account.setup.ts`) and saves its cookies.
`scripts/e2e-reset.mjs` deletes the database and those cookies, as the first
link of the `webServer` command rather than in Playwright's `globalSetup` —
global setup runs _after_ the server starts, and deleting the directory out from
under a live PGlite instance leaves it reading files that are no longer there.

**No `test.skip` on a missing precondition.** A spec that stands itself down
because the review queue is empty is a spec that passes for ever without
running. Create what the test needs — `02-review` enters its own untagged rows
rather than borrowing whatever the import happened to leave behind.

## In a sandbox with no network

`npm run e2e` downloads Chromium the first time. Where that is not possible —
an offline container, or one that ships a build whose revision does not match
this Playwright version — point at the browser that is already there:

```
PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome PLAYWRIGHT_NO_SANDBOX=1 npm run e2e
```

`PLAYWRIGHT_NO_SANDBOX` is for containers running as root, where Chromium's own
sandbox refuses to start. Neither is set in CI, which installs its own browser.
