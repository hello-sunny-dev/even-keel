# Runbook

## Local setup

```bash
nvm use                 # Node 22
npm install             # also installs the pre-commit hook
cp .env.example .env.local
npm test                # should pass with no database configured
npm run dev
```

`DATABASE_URL` can stay empty while working on parsing and the pure logic — the tests use
an in-process PGlite database, and the app renders a setup notice instead of crashing.

## Diagnosing a real statement

```bash
npm run dump -- ~/path/to/statement.pdf          # add a year if the statement omits it
npm run dump -- ~/path/to/statement.pdf 2025
```

Prints the reconstructed lines, what the parser made of them, and whether the amounts
reconcile against the opening and closing balance. **Every line is redacted before
printing**, so the output is safe to paste into a chat when working out a parsing rule.
It writes nothing and uploads nothing.

Real statements belong in `test-fixtures/real/`, which is gitignored. They stay on your
machine; CI skips the tests that need them.

## Database

Any Postgres works — Supabase and Neon both have a free tier sufficient for two people.

```bash
# 1. Create a project, copy the connection string into .env.local as DATABASE_URL
# 2. Apply the schema
npm run db:setup
```

Enable **point-in-time recovery** on the hosted database. Once a month, also take a local
copy — a provider account is a single point of failure:

```bash
pg_dump "$DATABASE_URL" --no-owner --format=custom > even-keel-$(date +%F).dump
```

Restore into an empty database with:

```bash
pg_restore --no-owner --dbname "$DATABASE_URL" even-keel-YYYY-MM-DD.dump
```

## Deploy

Vercel, from the repository. Set in the project's environment variables:

| Variable         | What it is                                         |
| ---------------- | -------------------------------------------------- |
| `DATABASE_URL`   | Postgres connection string                         |
| `SESSION_SECRET` | Long random string; changing it signs everyone out |
| `APP_PASSWORD`   | Shared password, until per-person accounts land    |

Secrets live in Vercel and in `.env.local`, never in the repository.

## Checks

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs all of these on every push and pull request. The pre-commit hook runs Prettier and
ESLint on staged files only, so it stays fast enough not to be worked around.

## If the parser misses rows on a real statement

The reconciliation line in `npm run dump` is the signal — if it says "off by $X", rows
were dropped or misread. The cause is almost always line reassembly, not the regexes:
`itemsToLines` in `src/lib/parse/pdf.ts` decides where one glyph run ends and the next
begins. Compare the printed lines against the PDF on screen, and adjust the gap threshold
there rather than loosening the amount pattern.
