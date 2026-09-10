# Decisions

One entry per decision that would otherwise be re-litigated. Newest last.

---

### 1. Deterministic parsing, never a model, in the import path

**Why.** A language model that misreads `412.80` as `41280` corrupts the ledger silently,
and nothing downstream catches it. Deterministic parsing is testable and auditable.
Verified: the synthetic fixture round-trips 27 of 27 transactions with no model involved.

**Consequence.** When a real statement defeats the parser, the model helps _write the
rule_ (`npm run dump`), and the rule ships as code.

**Also considered.** Pasting statements into a chat assistant. Rejected: the free web app
has no API so nothing can call it from the server; an API key is a separate paid product;
and pasting sends real account numbers to a third party, where free tiers may train on
them.

---

### 2. Sign comes from the running balance

**Why.** the bank prints amounts unsigned in separate debit and credit columns, and column
position is destroyed when a PDF is flattened to text. The balance delta is the only
signal that survives.

**Consequence.** The committed fixture prints unsigned amounts on purpose, so the
balance-delta path is the one under test rather than an easier one.

---

### 3. One-off is a flag, not a category name

**Why.** The spreadsheet this replaces had no macros, so "one-off" had to be encoded in
category names. That is why the same expense existed twice under two names.

**Consequence.** `one_off` on the category, overridable per transaction. The one-off log
is a filter, not a maintained list.

---

### 4. Dates are strings; a `Date` never crosses a boundary

**Why.** `Date` is an instant, not a day. `toISOString()` moves the day backwards east of
UTC; `getUTCMonth()` files the start of a month into the previous one. Both are silent —
the numbers still add up, under the wrong day. A household can span time zones.

**Consequence.** `::text` in SQL, strings in JSON, timezone consulted only for "today for
this person". See `src/lib/dates.ts`.

---

### 5. Investing is not spending

**Why.** Moving $1,000 into an ETF reduces cash but leaves net worth unchanged. Treating
it as spending makes the month score as a failure — an app built to grow assets
penalising the act of growing them.

**Consequence.** `kind` on every transaction: `income`, `expense` or `transfer`. Transfers
are excluded from both totals. Investment gain is **derived** — `Δbalance − contributions`
— never typed in, so there is nothing extra to remember each month.

---

### 6. Cadence is not always monthly, and not always whole months

**Why.** Utilities here bill roughly every two months, rates annually, and income is
fortnightly. A trailing average over a window that misses a billing cycle understates the
cost; `cadence_months` as an integer cannot express a fortnight at all.

**Consequence.** `cadence_unit` + `cadence_count`. A fortnightly item's monthly rate is
`amount × 365.25 ÷ 14 ÷ 12`. Trailing averages align to whole billing cycles. Twice a year a month
holds three pay cycles instead of two — the dashboard **labels** that rather than
smoothing it, because smoothing hides the one thing worth knowing.

---

### 7. Several statements import together

**Why.** Cadence cannot be detected from one statement, and a bimonthly bill may not
appear in it at all. Multi-file import is what makes the recurring math mean anything.

**Consequence.** One request per file (Vercel caps a body at 4.5 MB per request), merged
into one confirm table, deduped across files where consecutive statements overlap, and
imported as one batch under one `upload_id` so undo is one action. It also unlocks the
strongest available integrity check: statement N's opening balance must equal statement
N−1's closing balance, so a missing statement is named rather than absorbed.

---

### 8. PGlite for tests, hosted Postgres in production

**Why.** The interesting bugs — deduplication, splits, remembered rules, tenancy scoping —
live in SQL. Mocking the database would test the mock. PGlite is real Postgres, in
process, no server.

**Consequence.** A narrow `Db` port with two implementations, and a test that asserts the
two drivers agree on types, because they do not by default.

---

### 9. A shared password first, per-person accounts later

**Superseded by 11.** Accounts arrived earlier than commit 10 and there was never a shared password in a running build.

**Why.** Two people and a private URL. Per-person login is in the schema from the start
(`users`, `session_version`) because retrofitting it means rewriting every query, but
building the login screens before anything is usable would delay the first useful month
by a week.

**Consequence.** Shared password until commit 10, then real accounts, rate limiting and
password change. `household_id` is on every table from the first migration regardless.

---

### 10. The repository is private and the code moved out of Lab

**Why.** The seed categorisation rules are built from real statements, so this app does
not belong in a shared experiments repository.

**Consequence.** It lives in its own repository, with real statements kept out of git.

---

### 11. Invited accounts, never open registration

**Why.** One person opens the app, a partner joins the same household, and a few friends might later
get their own. That is three needs, and only the middle one is "share everything". Open
sign-up would answer none of them and would put a registration form on a private URL, where
the only people who can find it are strangers.

**Consequence.** `/start` creates the first account and then closes itself, so there is no
sign-up route left to find. Every later account comes from an invite of one of two kinds:
`join` carries a `household_id` and shares all figures; `new_household` carries none and
shares nothing. A database check keeps those two honest —
`check ((kind = 'join') = (household_id is not null))` — so an invite cannot be half of each.
Invites are single-use, expiring and revocable.

**Also considered.** An allow-list of email addresses. Rejected: it needs editing by hand in
the database for every new person, and it still needs a way for them to set a password.

---

### 12. The session version lives inside the token

**Why.** The proxy gates every route and runs on the edge, where postgres.js cannot reach.
Checking a session against the database on every request was therefore not available, and
signing a token that can never be revoked was not acceptable.

**Consequence.** The token carries `userId` and the `session_version` it was issued with.
The proxy verifies signature and expiry only; pages and writes re-read the account and
compare versions. A password change bumps the column and strands every other device — which
is the property that mattered — at the cost of a revocation taking effect on the next
request that reaches the database rather than instantly at the edge.
