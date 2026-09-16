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

---

### 13. The categories table is the only authority

**Why.** The seed array and the `categories` table held the same fields, and code read
whichever was nearer. The settings screen wrote to the table; the aggregates read the
array. Toggling one-off changed nothing any total could see, and a category the household
created was invisible to every figure on the dashboard.

**Consequence.** `CATEGORIES` seeds a new household and is never read again.
`categoryMap(db, household)` returns a `Categories` map, and every function that resolves
a category — `isOneOff`, `effectiveKind`, `categoryBreakdown`, `groupSeries`,
`recurringMonthlyRate`, `categorize`, the importer — takes it as an argument. Passing it
explicitly is noisier than a module-level lookup, which is the point: there is nowhere to
read a category from by accident.

---

### 14. `kind` decides income, the sign never does

**Why.** A $60 supermarket return is a positive amount in an expense category. Splitting
income from spending on `amount > 0` counted it as income — which raised the month's
income, raised core income, and moved all three savings scenarios for money nobody earned.
The category knows what a row is; the sign only knows which way the money moved.

**Consequence.** `effectiveKind()` reads the category, falling back to the transaction's
own `kind` for an untagged row, and a transfer stays a transfer whatever category it
carries. Spending is summed signed, so a refund nets against the category it came from and
a category refunded more than it was charged reads as negative rather than as spending.
The database carries the same rule in `transactions_income_is_positive`.

---

### 15. Cleared and short are told apart by geometry, not by colour

**Why.** The month strip's whole job is pass or fail at a glance, and green against
red is the one pair dichromatic vision cannot separate. Measured against this
palette with the validator, not by eye: ΔE 7.3 for deuteranopia in light mode and
5.1 in dark, where 8 is the bar. Saturating the green made it _worse_ — 6.2 — so
there is no version of green-and-red that passes.

**Consequence.** A dashed line is drawn across the strip at what the month had to
clear, on top of the bars. A bar ending under it is short, and the gap says by how
much — which is more than the colour was saying anyway. Colour agrees with the
geometry rather than carrying it. Every verdict elsewhere is a word (`Cleared`,
`Short`, `On track`, `Behind`) with the colour behind it, never a colour alone, and
the strip carries a screen-reader table of the same figures.

**Also considered.** Texture or a marker on short months. Rejected: the line costs
the same and also answers "by how much", which neither does.

---

### 16. The strip is anchored to the ledger, not to the selection

**Why.** Anchored to the month being read, opening March left no way back to April
except the dropdown — a chart that is supposed to _be_ the navigation became
decoration with a click handler. And extended back a fixed twelve months it drew
ten red bars for months before the household kept any figures at all, which reads
as ten failures rather than as no data.

**Consequence.** The window ends at the most recent month with data and never
begins before the earliest, so bars can be clicked in both directions and every bar
stands for a month that actually happened.

---

### 17. A balance is entered with what was added to it

**Why.** Growth is the reason to track an investment account at all, and a balance
alone cannot tell growth from a deposit. An account that went from $10,000 to
$10,500 either earned $500 or was paid $500 in — opposite facts about the same
number, and the difference between "our investments are working" and "we saved
harder". The plumbing that could infer it, a transfer tagged with its destination
account, does not exist yet and would not cover money moved outside the imported
account anyway.

**Consequence.** `balances.contributed` sits beside `balances.amount`: one more
field on a form somebody is already filling in, answered by the person who knows.
Growth is `closing − opening − contributed`, and only ever between two snapshots
that actually exist.

**Also considered.** Deriving contributions from transfers. Not rejected — it is
the better answer once transfers carry a destination, and this field stays as the
correction for anything it misses.

---

### 18. A skipped month never becomes a loss and then a gain

**Why.** The spreadsheet did this: March $10,000, no April entry, May $11,000. Read
month to month, April is a $10,000 loss and May an $11,000 gain. Both are fiction,
and they average out to something that looks plausible.

**Consequence.** A month with no entry carries the last figure forward and is marked
`estimated`, so a total is never presented as fresh when it is not. Growth is
measured between real snapshots with every contribution in the span subtracted, so
skipping April just widens the span from March to May.

---

### 19. Nothing recorded is not the same as nothing owned

**Why.** Reading a month from before the household started entering balances, every
bucket sums to zero, the goal reports 0% and the verdict reads _Behind_. That is a
claim about wealth made entirely out of missing data — and the most discouraging
possible screen to show someone on the day they start.

**Consequence.** `netWorthAt` returns `counted`, the number of accounts that had a
figure to give. At zero the goal is not scored at all and the screen says which
month has no balances, with a link to enter them.

---

### 20. A loan is stored as what is owed, positive

**Why.** Two people entering the same mortgage will otherwise enter it two ways, and
a $480,000 debt typed as a negative is *added* to net worth — a $960,000 error that
looks like good news.

**Consequence.** Positive, negated when summed. Said in the form label, enforced by
a trigger, and answered with a sentence rather than a constraint name. Interest on
a loan is reported as negative growth, because interest costs net worth: a
repayment is a contribution, not a gain.

---

### 21. A month total is a figure, not a line item

**Why.** The bank sends a statement once a quarter, so two months in three have nothing
to import. Waiting for the statement means the dashboard is blank most of the time,
and the whole point is to know each month whether it went well.

**Consequence.** `granularity = 'month'` rows carry a whole month's figure for one
category. They count in every total, every scenario and every chart, because they
are real money. They are kept out of the ledger, because the ledger is a list of
lines somebody could look up and a month total has no receipt behind it — listing
it there invites a search for one that does not exist. The one-off log will show
them, labelled.

Entering a month again replaces it rather than adding to it: it is a correction,
not a second month. The replacement touches only month-granularity rows, so a month
can hold both an imported statement and hand-entered totals for the categories the
statement never saw.

---

### 22. The idempotency key comes from the form, not from the values

**Why.** Manual entry has no statement to fingerprint. Fingerprinting the values
instead would make two genuinely identical entries — the same $4.49 charged twice
on the same day — collapse into one, which is the exact failure the fingerprint
exists to prevent everywhere else. Fingerprinting nothing would let a
double-pressed button write two rows.

**Consequence.** The form generates a key when it opens and rotates it after each
save. Pressing the button twice writes one row; entering the same thing again a
minute later writes a second. Verified in a browser: two identical entries, two
rows.

---

### 23. Minimise what is stored, rather than encrypt it

**Why.** The merchant name is the one piece of a transaction the app cannot do
without — categorisation, rules, the review queue and every chart are built on it.
Encrypting the description column would make all of that impossible, so
column-level encryption buys nothing here and costs the product. Disk-level
encryption at rest is the hosting provider's job and is already on.

**Consequence.** The rule is minimisation: keep the merchant, remove everything
that identifies a person. That means account, BSB and card numbers (always did),
customer reference numbers glued to a name (`Oriene1000000001` — these were
getting through), and the household's own names where a statement prints them
(`Osko Deposit - Receipt R Lee & A Morgan`).

Names are removed by asking the household who its members are rather than by
detecting names generally, which would take "Harbour Cafe By Leeson" and
"Leeward Sushi" with it.

**Also considered.** Storing a hash of the description and keeping the text only
in the browser. Rejected: the review queue, search and retroactive tagging all
need the text on the server, and a hash cannot be read by the person trying to
work out what a charge was.

---

### 24. Removing reference numbers is a correctness fix, not only a privacy one

**Why.** `Direct Debit - Receipt Origin Energy Ho Oriene1000000001 To` — that
reference changes every month. It was part of the merchant key, so April's key
and June's key were different strings, and a rule created by tagging April could
never match June. Every recurring direct debit — energy, insurance, the vet, the
gym — would have landed in the review queue every month for ever, and the symptom
is a queue that will not empty rather than anything that looks like a bug.

**Consequence.** The same edit fixes both. Six digits is the threshold, not four,
so `COLES 0292` and `BUNNINGS 2174` keep their store numbers: those identify a
shop, not a person, and they are stable month to month.

---

### 25. Seed rules are measured against the real statements, not read

**Why.** The seed rules were written from a taxonomy and tested against strings
invented to match them, so the suite was green while the rules classified 45.6%
of the household's own 933 transactions. The tests could not have found that: a
rule and its test were written in the same breath from the same guess.

Replaying every parsed description through `categorize` found the misses, and
almost all of them were one character wide. `\brestaurant\b` does not match
`COLLINS RESTAURANTS`. `\bbarber\b` does not match `ICONIC BARBERZ`.
`\bfitness\b` does not match `Northside Fitn`, which is how the statement
truncates it. `\b7-?eleven\b` does not match `7 ELEVEN 3009`. `\buber\s*eats\b`
does not match `UBER *EATS`. None of these look wrong when read.

One was worse than a miss: `\bhome\s*co\b` was seeded as a furniture retailer,
but on these statements "Northside Home Co" is the name of the shopping centre
an address ends with. `CWH NORTHSIDE HOME CO` matched both the chemist rule and
the furniture rule at the same priority, which is a tie, which is the review
queue — the chemist was never going to win an argument with a car park.

**Consequence.** 45.6% → 78.8% of real rows matched, and the distinct merchants
in the first review queue drop from 232 to 117. The tests now assert against
merchant text copied from the statements, truncation included.

**What is deliberately still unmatched.** `RACI` is a RAC direct debit and RAC
sells car, home and roadside cover; the line names none of them. `ATO ATO` is a
tax bill or a tax refund depending on a sign the description does not carry.
Guessing either puts a wrong number in a real total, and a wrong category nobody
is asked about is worse than an untagged one.

---

### 26. A transfer between our own accounts is marked at import, not asked about

**Why.** 22 of the 933 rows on these statements are the household moving its own
money: `Internal Transfer - Receipt To Everyday Account`, `To my …`, and on the
home-loan statement `Repayment - Direct Credit`, which is the other half of a
debit on the everyday account. Both halves land in the ledger once both
statements are imported. Left alone, one $1,538.46 transfer becomes $1,538.46 of
spending that never happened and $1,538.46 of income nobody earned, and _actual
saved_ — the number the app exists to produce — is wrong twice in the same month.

No category can decide this. The same amount in the same category is real
spending when it leaves the household, which is why `kind` lives on the
transaction and the schema has always had `'transfer'` on it. Nothing ever set it.

**Consequence.** `isInternalTransfer` runs before categorisation, sets
`kind = 'transfer'`, leaves the category null, and — the part that matters for
the queue — marks the row as not needing review. A transfer is the one untagged
row that is not an open question.

**Why the list is short.** Marking a real payment as a transfer hides it from
every total with nothing on screen to say so; leaving a transfer in the queue is
visible and costs one tap. So only the bank's own wording for a move between a
customer's own accounts counts. `TRANSFER RECEIPT TRANSFER FROM` with the account
number redacted away could be either, `SWIFT TRANSFER` is usually money leaving
the country, and `Osko Payment - Receipt Transfer To Competitive Cleaning` is a
cleaner being paid. All three stay questions, and the review queue grew a
**Transfer** button so the answer can be given without inventing a category for it.

---

### 27. Recurring spend by group is one hue and a ranked list, not twelve colours

**Why.** The obvious drawing for "where does the money go" is a stacked bar per
month, one colour per group. There are twelve groups. A categorical palette is
only readable to about eight, and every hue past that has to be invented — which
means inventing a colour and then hoping it separates from its neighbours for a
reader with deuteranopia. It would not: the eight-hue limit is where the
separation runs out, not where the imagination does.

The question is a magnitude with the identity already written next to it, so a
ranked list of single-hue bars answers it exactly, in reading order, with the
label right there. The tail folds into one row that says how many groups it is
rather than becoming a colour nobody can name.

**Consequence.** Two colours in the whole trends page: teal for income and amber
for spending, measured at ΔE 11.1 (protanopia, light) and 9.3 (dark) against a
bar of 8. Both charts still carry a legend and an end-label, so colour is never
the only channel — the green/red pass-fail pair elsewhere fails that test at
ΔE 7.3, which is why the month strip is read by geometry instead.

**Also.** Axis labels are HTML positioned over the SVG rather than `<text>`
inside it. A `font-size: 10` inside a viewBox that scales to fill its container
renders at about 6px on a phone and 29px on a desktop — the one thing on the
page that has to stay readable at both.

---

### 28. A category is editable, mergeable and creatable, or the taxonomy is a guess that sticks

**Why.** The category list was written in advance from a spreadsheet. Some of it
is wrong for this household and all of it will drift: a "Dining / Cafe /
Takeaway" that should have been split, two categories that turned out to be one
thing, a rhythm that is really every two months. `setCategorySettings` and
`mergeCategories` were written and then had no way to be called.

**Consequence.** Rename, one-off, billing rhythm, monthly target, merge into
another, archive and restore, and create a new one — on the goals page, because
that is where the numbers these settings move are set.

**The rules the form enforces.** A merge across kinds is refused: folding an
income category into an expense one would turn money in into money out on the
way past and change a month's totals for a reason nobody could see on screen. A
merged-away category is archived rather than deleted, so the rows that still
name it keep their name. And an id is derived from the name once and never
again — renaming "Dog" to "Bilbo" must not orphan what is filed under it.

---

### 29. The end-to-end suite runs a production build, and found three things nothing else could

**Why.** Every check up to here ran in the same process as the code it was
checking. The three things that broke in production broke _because_ it was
production — bundled, behind a real HTTP server, in a browser.

**What it found, none of it visible in `next dev`:**

1. **PDF import was completely broken in a built server.** `pdf.ts` imported
   pdfjs by a computed absolute file URL, to survive `tsx` handing the module to
   Node as a `data:` URL. A bundler reads `import()` calls to decide what to
   include, cannot read a computed one, and leaves a stub that throws "Cannot
   find module as expression is too dynamic" — which reached the user as _"That
   file could not be read as a PDF"_, on every statement. The fix is the literal
   specifier first (`serverExternalPackages` leaves it as a plain runtime
   require) with the computed one behind it for the `tsx` case.

2. **Every state-changing request was refused as cross-site on any host that is
   not literally `localhost`.** The origin check compared against
   `request.nextUrl.origin`, which Next normalises: under `next start` it reads
   `http://localhost:<port>` whatever host was dialled. A browser at
   `http://127.0.0.1:3210` could not sign up. The check now compares against the
   `Host`/`X-Forwarded-Host` header, which is what the browser used to build the
   `Origin` it sent.

3. **The secondary text colour failed WCAG AA on every page.** `--muted` on
   `--paper` measured 4.33:1 and `--faint` 2.57:1, against a 4.5:1 minimum.
   Nobody looking at it would have found that; an axe assertion did, on the
   first run. Both are darker now, and the warning colour used as text got its
   own darker token so the chart mark could stay the colour the palette
   validator passed.

**How it is arranged.** One worker against one PGlite database, in file order,
because every spec drives the same household — parallel runs would have one
test tagging what another asserts is untagged. The password spec is its own
project depending on the others, since changing the password ends the session
they are all signed in with: anything scheduled after it would quietly run
against the login page and pass.

**No skipped tests.** The review specs create their own untagged rows instead of
borrowing whatever the import happened to leave behind, and the mobile specs
assert they are not on the login page before measuring the width — a page that
fits the screen because you are signed out is a green test that checks nothing.

---

### 30. The deployment is checked against its own file manifest, because nothing else can

**Why.** Every statement failed on Vercel with _"That file could not be read as
a PDF."_ The real message was underneath it:

```
Setting up fake worker failed: Cannot find module
'/var/task/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'
```

With no worker configured, pdfjs falls back to a "fake worker" that imports
`pdf.worker.mjs` by a computed specifier from inside `pdf.mjs`. A tracer cannot
follow a computed specifier, so it shipped `pdf.mjs` and left the worker behind
— the same shape of bug as the one in `pdf.ts` a few commits earlier, this time
inside the library rather than in our own code.

**Why no test caught it.** Every check runs where `node_modules` is on disk next
to the build: `npm test`, `npm run build`, and the end-to-end suite, which drives
a real production build in a real browser and imported the same fixture happily.
An untraced file resolves anyway. The deployment is the only place where what
was traced and what exists are the same set — and the first reader of that
difference was somebody uploading their own bank statements.

**Consequence.** `scripts/check-tracing.mjs` asserts against the trace manifest
that `/api/import` produced: the worker, the library, and the standard fonts
must be listed. It runs in CI after the build and again in the deploy workflow
before anything ships. A file that the runtime needs and the tracer cannot see
now has to be declared, and forgetting is a failed build rather than a failed
import.

**Also.** `GlobalWorkerOptions.workerSrc` is now set to the resolved absolute
path, so pdfjs is told where the worker is instead of deducing it. The tracing
entry is what makes the file exist; this is what stops the resolution depending
on where the runtime believes it is standing.

---

### 31. Which statement a row came off is part of what it means

**Why.** 196 of 908 rows imported untagged, and the largest single group was
eighteen identical fortnightly rows reading `TRANSFER RECEIPT TRANSFER FROM`,
`+$1,068.24`. The obvious question: _if that is all it says, how
are we supposed to know what it is?_

The app already knew. The row is on the home-loan statement, money is arriving,
the amount never changes and the gap is always fourteen days. Nothing else pays
money into a mortgage. It is the repayment — unambiguous the moment you know
which account you are looking at, and unanswerable without that.

The categoriser was only ever shown the description. Decision #26 deliberately
left `TRANSFER FROM` unmatched because on an everyday account it could be
anybody's money, and that reasoning was right for the account it was thinking
about and wrong for the other one.

**Consequence.** `ParseResult` carries `isLoanAccount`, decided from what the
statement contains rather than from its filename: a loan account charges
interest and is never spent from, so both halves are required and a savings
account that earns interest is not mistaken for a mortgage. On a loan
statement, money arriving is the repayment (a transfer, not income), interest
is `mortgage-interest`, and LMI and the settlement fee are the house purchase.
On an everyday statement the same words still mean nothing in particular and
still go to review — there is a test that asserts exactly that.

**The repayment is not the cost.** Moving money from the everyday account to
the loan account leaves the household holding the same wealth as a smaller
debt. The part that actually leaves is the interest, which is why it needed a
category of its own rather than being folded into `mortgage-repayment`.

**The drawdown is still asked about.** One large debit at the start of a loan
statement is a house being bought. It is the row where being wrong is most
expensive, so it goes to the queue with its amount in front of the reader
instead of being guessed at from the word "transfer".

**And the queue now says what it knows.** A description alone is often not
answerable; "twelve like this" and the merchant key make it so. The confirm
table also names the statement each row came from — the only place it can,
since the filename is deliberately never stored.
