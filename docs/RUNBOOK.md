# Runbook

## Local setup

```bash
nvm use                 # Node 22
npm install             # also installs the pre-commit hook
npm run dev             # http://localhost:3000
```

**No database, no account, no configuration.** With `DATABASE_URL` unset the app runs on
PGlite — Postgres compiled to WebAssembly, in this process, no server and no network. The
first visit offers to create an account; from there the app is fully usable.

That development database is a directory, `.pglite/`, which is gitignored. It survives a
restart, which is the point — but it is a scratch database on one machine, not a backup
and not somewhere to keep figures that matter. `npm run db:setup` writes to the same
place, and the test suite uses its own in-memory one so nothing a test does can touch it.

To throw it away and start over, delete the directory:

```bash
rm -rf .pglite
```

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

## A real database, when it is time to deploy

PGlite is not a deployment target: a serverless filesystem does not persist between
requests, so on Vercel the directory would be empty every time. Anything hosted needs real
Postgres — Supabase and Neon both have a free tier sufficient for two people.

```bash
# 1. Create the project yourself and copy the connection string
# 2. Put it in .env.local as DATABASE_URL — never in the repository
# 3. Apply the schema
npm run db:setup
```

The connection string is a credential. It belongs in `.env.local` locally and in Vercel's
environment variables in production, and nowhere else — not in the repository, not in a
chat, not in a commit message. Setting it is the only change needed: the same SQL runs on
both, through the `Db` port.

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

Secrets live in Vercel and in `.env.local`, never in the repository.

## Accounts

The first visit to a database with no accounts offers `/start`, which creates the first
account and the household it keeps, then closes itself. Everyone after that arrives through
an invite made under **Settings → Invite** — _join this household_ shares every figure,
_start their own_ shares nothing. Each link works once and expires.

**Locked out.** There is no password reset by email; with two people, it is a database
statement. Either hand a new hash to the account:

```sql
-- Generate the hash first:
--   npx tsx -e "import('./src/lib/auth-server').then(m => m.hashPassword('new passphrase')).then(console.log)"
update users
   set password_hash = 'scrypt$...',
       session_version = session_version + 1
 where lower(email) = lower('jamie@example.com');
```

…or, if nobody can get in at all, delete the accounts so `/start` reopens. The household and
every transaction survive; only the sign-ins are removed:

```sql
delete from users where household_id = (select id from households limit 1);
```

Bumping `session_version` is what signs the other devices out. Do it deliberately after any
recovery, since anyone still holding an old cookie stays signed in until it changes.

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
