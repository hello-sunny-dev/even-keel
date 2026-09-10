# Architecture

Next.js 16 (App Router) on Vercel. React 19, Tailwind 4, Framer Motion. Postgres in
production; PGlite — real Postgres compiled to WebAssembly — in tests, so the same SQL is
exercised without a server.

## The shape of it

```
CSV / PDF bytes ─→ extract ─→ lines ─→ parseStatementText ─→ ParsedTransaction[]
typed transaction ────────────────────────────────────────↗
typed month total ───────────────────────→ month-granularity entry
                                                            │
                                categorize(description, rules)
                                                            ↓
                              editable confirm table (nothing written yet)
                                                            ↓
                                  one atomic batch, one upload_id
                                                            ↓
       DEFENSE  monthlySummary · scenarioLadder · categoryBreakdown · recurringRate
       OFFENSE  contributions · gainLoss · portfolioReturn
       BOTH     netWorthSeries · goalProgress · projection
```

Everything from `parseStatementText` down to the aggregates is **pure and database-free**.
That is what makes the test suite possible: a month's arithmetic can be checked against
hand-calculated figures without a server, a fixture database, or a browser.

## Parsing, and why there is no model in it

A bank statement PDF is _generated_, not scanned — the characters are in the file with
coordinates. No OCR, no LLM.

1. **Extract** — `pdfjs-dist` yields glyph runs with positions.
2. **Reassemble** — `itemsToLines` groups runs sharing a baseline, orders them left to
   right, and inserts a space where the horizontal gap is wide enough to be one.
3. **Parse** — a line is a transaction when it starts with a date and ends with a
   money-shaped token.
4. **Recover the sign** — the bank prints amounts unsigned beside a running balance, and column
   position is lost once a PDF is flattened to text. So sign is resolved in order:
   explicit `-`/`+` → `CR`/`DR` → **balance delta** → keyword. The committed synthetic
   fixture prints unsigned amounts specifically so the balance-delta path is the one
   under test.

**An LLM never touches an amount.** A model that reads `412.80` as `41280` once has
corrupted the ledger silently, and there is no test that catches it afterwards.
Deterministic parsing is auditable; a model is not.

Where a model _is_ useful is in the development loop: if a real statement defeats step 2,
run `npm run dump -- <file>`, paste the redacted output into a chat, work out the rule
there, and ship the rule as code. It then runs offline and free, forever.

**The real risk lives in step 2, not step 3.** The tolerance in the parser only ever sees
lines that were already assembled. If a statement splits `184.55` into `184` and `.55`,
the row fails to match and is dropped _silently_. That is why `scripts/dump-pdf.mts`
exists and why every import reconciles its balances.

## Dates

`YYYY-MM-DD` strings end to end. Never a `Date`.

A `Date` is an instant, not a day: `toISOString()` moves the day backwards anywhere east
of UTC, and `getUTCMonth()` files the first days of a month into the previous one. Both
failures are silent — the totals still add up, under the wrong day. SQL casts with
`::text`; JSON carries strings; a timezone is consulted only to answer "what is today
_for this person_" (`src/lib/dates.ts`).

## Money

`numeric(14,2)` in Postgres, integer cents in arithmetic, `::float8` at the query
boundary with one mapper. Floats are never accumulated directly — `sumAmounts` works in
cents for exactly this reason.

## Currency

The columns exist; the conversion math does not, yet. A database check constrains
transactions to the household's display currency, so a second currency cannot silently
produce `₩500,000 + A$3,000 = 503,000 of nothing`. Opening it later means grouping by
currency, converting per month from `fx_rates`, and storing the rate used on each row so
restatement is explicit rather than retroactive.

## Database access

One narrow port, two drivers:

```ts
export interface Db {
  query<T>(text: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}
```

`postgres.ts` wraps postgres.js; `pglite.ts` wraps PGlite. Three divergences the port has
to hide, none of which a naive test would catch:

- **Types.** postgres.js returns `numeric` as a string and `date` as a `Date`; PGlite
  differs again. Casting in SQL and mapping in one place is the fix.
- **Transactions.** Using the outer handle inside a `transaction()` callback silently
  escapes the transaction on postgres.js and deadlocks PGlite. The port passes `tx`.
- **Bulk insert.** postgres.js's array helper does not exist through `sql.unsafe`;
  inserts go through `unnest($1::date[], $2::numeric[], …)`, which works on both.

## Seams left open on purpose

- `parseStatementText` takes an options object — where a per-bank parsing profile would
  slot in if this ever meets a second bank.
- `fx_rates` is a table, not a live call — a rate fetcher can be added without touching
  the schema.
- Message lookup goes through `lib/i18n.ts` from the start, so a second language is a
  file, not a refactor.
- Every table carries `household_id` and both partial unique indexes include it, so
  multi-tenancy is a switch rather than a migration.
