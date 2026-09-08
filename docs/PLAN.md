# Even Keel — implementation plan

> **Even Keel** · *Net worth for two*
> Revised after an adversarial review; findings verified against the prototype code.

## Context

Two partners want one question answered every month: **are we on track to grow our
assets?** The spreadsheet this replaces couldn't answer it — no macros, so "one-off vs
recurring" was faked with category *names*, the per-month one-off log was rebuilt by
hand, and bimonthly bills quietly skewed trailing averages.

The framing behind the project: in a couple one person plays **offense** (investing)
and one plays **defense** (spending discipline, saving from fixed income). This is the
defense instrument — but it must show the offense too, or buying an ETF looks like a
bad month.

Data minimization is a build requirement, not a later hardening pass.

---

## Decisions taken

| | Decision |
|---|---|
| Name | **Even Keel**, tagline *Net worth for two*. repo + package `even-keel`. |
| Repo | New **private** repo — Lab is a portfolio repo that may go public. |
| Existing code | **Keep** as a starting point, but **fix the four bugs below first** — the review found real defects in it. |
| Database | Hosted Postgres in production (Supabase/Neon) + **PGlite** for tests. |
| Goals | **Two** — cash savings and net worth. |
| Entry | CSV → PDF → single transaction → whole month, in that order of preference. |
| Assets / super | Hand-entered monthly balance snapshots. |
| Future-proofing | Full schema (households, users, currency, FX, transfers, investments); **conversion math deferred behind a DB constraint**, not half-built. |
| Auth | Per-person login — but **after** something usable exists. |
| AI | Off by default. Never in the parsing path. |
| Docs | `docs/PRD.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `RUNBOOK.md` — committed first. |

---

## Bugs in the code already written — fix before building on it

Verified by reading the files, not inferred.

**B1 — the math reads a constant, the settings UI writes the database.**
`aggregate.ts:1` imports `getCategory` from the static `CATEGORIES` array. `isOneOff`,
`categoryBreakdown`, `groupSeries` and `recurringMonthlyRate` all resolve `oneOff`,
`cadenceMonths` and `group` from that file, while `queries.ts:setCategorySettings`
writes those same fields to the `categories` table. Toggling one-off in the UI changes
nothing in any total, and a user-created category is invisible to the aggregates.
→ Every aggregate takes `categories: Map<string, Category>` loaded from the DB. Delete
the `CATEGORY_BY_ID` global; `CATEGORIES` becomes seed data only. Test: flip `one_off`
in the DB, assert `oneOffSpent` moves.

**B2 — the fingerprint breaks in two ways.**
`transactionFingerprint` is `date|DESCRIPTION|amount` (`statement.ts:247`).
*(a)* The confirm table lets the user correct a misparsed amount or date; the corrected
row gets a different fingerprint, so re-importing the same PDF inserts the original
values again as a "new" row. Silent double-count — the exact failure the fingerprint
exists to stop. → Fingerprint is computed from the **parsed** values and stored as
`source_fingerprint`; user edits change `txn_date`/`amount` but never the fingerprint.
*(b)* Two genuinely identical rows on one day (two $4.49 Apple charges) share a
fingerprint and `on conflict do nothing` silently drops one. → Append an occurrence
index within the statement (`…|#2`), and include the running balance when present.
Both get tests.

**B3 — a refund is counted as income.**
`aggregate.ts:53` splits income from spend on `t.amount > 0`. A $60 Woolworths return
inflates `totalIncome`, `coreIncome` and the whole scenario ladder. → `kind` derives
from the category unless it is a transfer; a positive amount in an expense category
nets against that category's spend. DB check:
`(kind='transfer') or (kind='income' and amount>0) or (kind='expense')`.

**B4 — dates and months are computed in UTC.**
`months.ts:42` uses `getUTCMonth`; at 07:00 on 1 October in Perth or Seoul the dashboard,
the balances form and the manual-entry default all say September. `statement.ts:132`
falls back to `new Date().getUTCFullYear()`, so importing last year's `DD/MM` statement
in January stamps the wrong year silently. `queries.ts:toTxn` does
`Date.toISOString().slice(0,10)`, which shifts a local-midnight date back a day on any
UTC+ machine — including a Perth laptop running PGlite. → Dates are strings end to end
(`::text` in SQL, `YYYY-MM-DD` in JSON); "today" and the default month come from the
client; a year fallback becomes a warning the confirm table must acknowledge.

---

## Correctness rules the whole app obeys

- **Money**: `numeric(14,2)` in Postgres, integer cents in any arithmetic, `::float8`
  cast at the query boundary with one mapper layer. `sumAmounts` already works in cents.
- **Currency (v1)**: the columns exist, the math does not. A DB check constrains
  `transactions.currency = households.display_currency` so a second currency cannot
  silently produce `₩500,000 + A$3,000 = 503,000 of nothing`. Opening it later means:
  group by currency, convert per month via `fx_rates`, and store `fx_rate_used` on the
  row so restatement is explicit. `fx_rates.rate` is `numeric(18,8)` — KRW→AUD is
  ~0.0011 and would round to zero at 4dp — with the `base→quote` direction documented.
- **Dates**: strings, never `Date`, across the wire and the DB boundary.
- **Gaps in balances**: gain/loss is computed only between two *actual* snapshots, with
  contributions summed across the span. A carried-forward month renders as `estimated`,
  not as a number — otherwise skipping July turns a $500 contribution into a $500 "loss"
  and an $500 phantom gain in August.
- **Month-granularity rows** appear in the one-off log tagged *(month total)*; they are
  excluded from the transaction **ledger** only. Otherwise the dashboard's one-off total
  and the one-off page disagree.

---

## The `Db` port — three divergences PGlite tests would not catch

1. **Types.** postgres.js returns `numeric` as a string and `date` as a `Date`; PGlite's
   defaults differ again (`int8` → BigInt). A `query<T>` generic would lie. → Cast in
   SQL (`amount::float8`, `txn_date::text`, `count(*)::int`), one mapper layer, and a
   test asserting `typeof` on both drivers.
2. **Transactions.** Calling `db.query` instead of `tx.query` inside `transaction()`
   silently escapes the transaction on postgres.js (different pooled connection) and
   **deadlocks** on PGlite (single connection). → The port passes `tx` explicitly and an
   ESLint rule bans `db` inside a transaction callback.
3. **Bulk insert.** `queries.ts:174` uses postgres.js's `sql(rows, ...cols)` helper,
   which does not exist through `sql.unsafe`. → Rewrite as
   `insert … select * from unnest($1::date[], $2::numeric[], …)` — one statement, one
   round-trip, works on both drivers.

---

## Platform constraints (Vercel) the plan must design around

- **In-memory rate limiting is per-instance and resets on cold start** — the test would
  pass while protecting nothing. → `login_attempts` table.
- **Middleware cannot reach postgres.js.** Next 16 ships both `middleware` and `proxy`
  filenames (`MIDDLEWARE_FILENAME`/`PROXY_FILENAME` both present in 16.2.12; I found no
  deprecation warning, so either works — we use `proxy.ts` as the newer name). Session
  invalidation on password change therefore carries a `session_version` **inside** the
  signed token, checked against the DB only on API writes.
- **4.5 MB request body limit.** Check `content-length` first and return a real message
  rather than an opaque 413.
- **Malformed PDFs**: map pdfjs `PasswordException` / `InvalidPDFException` to
  "This PDF is password-protected / is not a statement", never a 500 that echoes a filename.
- **Bundling**: `outputFileTracingIncludes` must include `pdfjs-dist/standard_fonts/**`,
  or the runtime `require.resolve` path resolves to files that were never deployed.

---

## De-risking the real statement — the actual risk is line assembly, not regexes

The tolerance I was relying on lives in `parseStatementText`, which only ever sees lines
`itemsToLines` already assembled. That function inserts a space when the x-gap exceeds a
**fixed 0.6 PDF units** (`pdf.ts:59`), independent of font size. Real bank PDFs emit one
item per word or per glyph cluster with kerning gaps around that threshold, so
`WOOLWORTHS` can split into `WOOL WORTHS`, or `184.55` into `184 .55` — which then fails
`AMOUNT_TAIL` and the row is **skipped silently**. A `skipIf(empty)` fixture test is not
a mitigation; it stays green forever.

Three fixes, all in the first two commits:

1. `scripts/dump-pdf.mjs <file>` prints redacted lines plus the parse result. **Jamie
   runs it on one real statement before any UI is built.** This is the single highest-value
   step in the plan and it costs an afternoon.
2. The gap threshold becomes relative to font size (`> 0.25 * fontSize`), merging items
   below it.
3. The confirm table surfaces `skipped` and `warnings`, plus an
   **opening → closing balance reconciliation line** ("matches statement" / "off by $X").
   A silently dropped row is then caught at import, not at year end.

**Also verify (5 minutes):** the bank web banking almost certainly offers on-demand
**CSV transaction export**. If it does, the quarterly-PDF constraint disappears — a CSV
importer is ~50 lines, reuses the categorizer and the fingerprint, and becomes the first
tab on `/add` with PDF second. This changes the product more than any feature in this plan.

---

## Screens

| Route | Content |
|---|---|
| `/login` | **Even Keel · Net worth for two.** Two seeded accounts. No registration, ever. |
| `/` **Dashboard** | Period selector (year + month). Goal strip (cash + net worth, % there, expected-by-now marker, on-track pill, sparkline). **Defense / Offense band.** **12-month bar strip** — height = saved, green cleared / red short; the chart *is* the navigation. Income / spent / actual saved → **scenario ladder** (all three) → category breakdown. **First-run state** when there is no data: three steps (set goals → add accounts + balances → import). |
| `/transactions` | **The ledger.** Month filter, text search, tap to edit category / one-off / kind, multi-select → bulk assign, delete, undo. Without this, month 3 is "it tagged 40 things wrong and I can fix them one at a time from a queue." |
| `/add` | **CSV** (if it exports CSV) → **PDF** → **one transaction** → **whole month**. PDF and CSV both land in the editable confirm table; nothing is written until Import. The month form pre-fills last month's value per row with a "same as last month" action, and shows only categories with history plus "+ other". |
| `/review` | Tagging queue. On tag: *"Apply to 6 other transactions from WOOLWORTHS?"* (default yes) — one `update … where merchant_key = $1`. Split into parts. |
| `/one-offs` | One-off costs for the month, month-total rows included and labelled. |
| `/trends` | Income vs recurring; recurring by group; cumulative net cash flow; cash projection. |
| `/goals` | Both goals editable; three scenarios; category settings including **merge into…** and rename. |
| `/assets` | Net worth + Available / Invested / Locked; accounts with hand-entered balances and derived gain/loss; net worth over time. |
| `/settings` | Password change, display currency, locale, accounts. |

**Mobile is the primary device**, so navigation is a **bottom tab bar of four** — Home,
Add, Review, More — with the rest under More. A seven-item horizontally scrolling pill
row hides three destinations with no affordance. Tables become card rows below `sm:`.

---

## Data model

Every table carries `household_id`. **Both partial unique indexes include it** —
`transactions (household_id, source_fingerprint) where split_parent_id is null` and
`rules (household_id, pattern) where match_type='merchant'` — otherwise tenancy is
decoration and two households collide on a shared merchant.

- **`households`** — `name, display_currency, locale`
- **`users`** — `household_id, email, display_name, password_hash, session_version, role`
- **`login_attempts`** — `identifier, ip, attempted_at` (rate limiting must survive cold starts)
- **`categories`** — `name, group, kind, one_off, cadence_months, target_monthly, confirmed_monthly_rate, archived`. Archived categories stay **loadable for display** so old rows keep their name.
- **`rules`** — `pattern, category_id, match_type, source, priority`
- **`transactions`** — `txn_date, month, description, merchant_key, amount, currency, balance, kind ('income'|'expense'|'transfer'), transfer_account_id, category_id, one_off_override, needs_review, source ('csv'|'pdf'|'manual'), granularity ('transaction'|'month'), source_fingerprint, upload_id, deleted_at, split_parent_id, is_split_parent`
- **`uploads`** — `uploaded_at, kind, parsed_count, inserted_count, skipped_count`. `upload_id` on transactions makes **"undo this import"** a single soft-delete by id.
- **`accounts`** — `name, kind ('cash'|'investment'|'super'|'property'|'loan'), owner_user_id, currency, bucket ('available'|'invested'|'locked')`. Loan balances are stored **as amount owed, positive**, negated by kind — stated in the form label and a check constraint, because otherwise the two of them will enter it opposite ways.
- **`balances`** — `account_id, month, amount`, unique `(account_id, month)`
- **`goals`** — `kind ('cash'|'net_worth'), target_amount, target_months, opening_balance, annual_rate, active`
- **`savings_plans`** — all three scored every month; `active` picks the headline verdict only
- **`fx_rates`** — `base, quote, month, rate numeric(18,8)`

**Cash goal has one authority: the balance snapshot.** The ledger's cumulative
`actualSaved` will differ every month by timing and by anything off the imported
account, so it is shown as *"explained by transactions: $X of $Y"*, never as a rival total.

**Import is one transaction**, and the server re-validates every client-edited row
(finite amount, valid date, existing category) and recomputes duplicates itself. It
never trusts the client's "23 will import, 4 skipped".

---

## Commit sequence — something usable on a phone by day 2

The previous ordering front-loaded four commits of infrastructure before anything ran.
Reordered so the riskiest unknown is hit first and the two of them can use it early.

1. **Scaffold + docs + `scripts/dump-pdf.mjs`.** Prettier, ESLint, hooks, CI skeleton,
   `docs/*`. Fix **B4** (dates). *Jamie runs the dump script on a real statement.*
2. **Parser hardening from what the dump shows** — font-size-relative gap, reconciliation
   check, warnings surfaced. Fix **B2** (fingerprint). CSV importer if the bank exports CSV.
3. **Minimal schema + migrations + `Db` port** (single household row, shared password
   kept for now) + import with the editable confirm table, atomic and undoable.
4. **`/transactions` ledger** — search, edit, bulk assign, undo.
5. **`/review`** — tagging with retroactive apply, split.
6. **Dashboard** — first-run state, period selector, goal strip, defense/offense band,
   month strip, scenario ladder, breakdown. Fix **B1** (categories from the DB) and
   **B3** (refunds) here, with tests, since this is where they surface.
7. Goals, scenarios, category settings incl. merge.
8. Assets — accounts, balances, buckets, derived gain/loss (gap-aware), net worth.
9. One-offs, trends, charts.
10. **Auth** — users, scrypt, `login_attempts` rate limiting, session_version, `/settings`
    password change. Shared password until here; two people, a private URL, and a fixed
    deadline make that an acceptable ordering.
11. Households/currency constraint, i18n scaffold, PWA manifest, security headers,
    E2E suite, privacy sweep.

Docs updated in the same commit as the behaviour. Pushed after every stage — the
container is ephemeral.

---

## Privacy & security

Honest framing for the README: **proportionate care for a small private tool, not a
bank-grade compliance claim.**

- Every route gated; only `/login` + `/api/login` public
- Uploaded PDF/CSV stays a `Uint8Array` — no `writeFile`, no temp file, never in the DB
- `redactDescription()` before every persist path, unit-tested
- `uploads` stores counts only, no filename
- scrypt hashes, per-user salt; `login_attempts` rate limiting; session rotation on
  login; `session_version` bump invalidates every session on password change
- CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`; cookies httpOnly + secure + SameSite=Lax;
  origin check on state-changing POSTs
- eslint `no-console` over `src/`; postgres.js `debug: false`
- `.gitignore`: `test-fixtures/real/`, `.env*`; `.env.example` names only
- `robots` noindex/nofollow; no third-party analytics; no LLM call in the default build
- **Backups**: PITR on the hosted DB + a documented monthly `pg_dump`

---

## Tests

`vitest` for units and PGlite integration; `@playwright/test` for E2E. Both in CI.

Beyond the suite already planned (redaction, statement parsing, PDF fixture,
categorization, hand-calculated month aggregates, scenarios, goals, net worth, savings
math, the five spreadsheet regressions, auth), the review adds:

| Test | Asserts |
|---|---|
| `categories-db.test.ts` | Flipping `one_off` in the DB moves `oneOffSpent` — **B1** |
| `fingerprint.test.ts` | Editing an amount in the confirm table does not create a re-import duplicate; two identical same-day charges both survive — **B2** |
| `kind.test.ts` | A refund in an expense category reduces that category's spend and does not raise income — **B3** |
| `timezone.test.ts` | Month bucketing and `toTxn` are identical under `TZ=Australia/Perth`, `Asia/Seoul` and `UTC` — **B4** |
| `db-port.test.ts` | `typeof` of numeric/date/count identical on postgres.js and PGlite; a transaction callback using the outer handle is rejected |
| `import-atomic.test.ts` | A failure mid-import leaves zero rows; undo by `upload_id` restores the prior state including replaced month rows |
| `balance-gaps.test.ts` | A skipped month does not produce a phantom loss then a phantom gain |
| `currency-guard.test.ts` | Inserting a non-display-currency transaction is rejected by the DB |
| `retro-tag.test.ts` | Tagging a merchant updates its untagged history |
| `empty-state.test.ts` | Every page renders with zero transactions, no plan and no accounts |

E2E journeys: sign in; import with edits and exclusions; re-import shows all duplicates;
tag + retroactive apply; split; scenario switch flips March to short; bar-strip
navigation; password change signs out the old session. Axe assertions on the dashboard
and the import table.

---

## Verification

```
npm run fixture:sample && npm run typecheck && npm run lint && npm test && npm run e2e
npm run build              # must succeed with no DATABASE_URL
node scripts/dump-pdf.mjs <real statement>   # locally
```

Then drive the app with Playwright against PGlite at desktop and iPhone-SE widths.

## What I cannot verify here

- **Real statement layout** — mitigated by the dump script + reconciliation check above, not by a skipped test.
- **Whether the bank offers CSV export** — to be checked; it would reorder `/add`.
- **Hosted Postgres and live FX** — PGlite runs the same SQL; rates are entered by hand in v1.
- **Vercel deploy** — create the project and set `DATABASE_URL`, `SESSION_SECRET`.

## Open, to settle with real numbers

The net-worth "on track" test is linear (start → target). Once property revaluations
land it will be lumpy and a contribution-based measure will read better. Revisit with
real data rather than guessing now.
