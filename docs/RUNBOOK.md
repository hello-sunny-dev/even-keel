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
requests, so on Vercel the directory would be empty every time. A production build refuses
to fall back to it — better a startup error than an app that appears to work and loses
everything on the next cold start.

**The connection string is a credential.** It belongs in `.env.local` on your machine and
in Vercel's environment variables in production, and nowhere else: not in the repository,
not in a commit message, not pasted into a chat. Nobody needs to see it to work on this.

### Supabase, step by step

1. **New project.** Any region; `ap-southeast-2` (Sydney) is nearest. Save the database
   password it generates — Supabase will not show it again.
2. **Connect → Connection string → Transaction pooler.** Take that one, not "Direct
   connection". It looks like:

   ```
   postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres
   ```

   Port **6543** is the pooler; 5432 is the database itself. A Vercel function runs per
   request, and direct connections would run out. The app detects a pooled URL and turns
   off prepared statements, which a transaction-mode pooler cannot keep — without that it
   works in testing and fails the moment two requests overlap.

3. **Apply the schema**, from your machine, with that string in `.env.local`:

   ```bash
   npm run db:setup
   ```

4. **Vercel**: deploy from GitHub Actions rather than from Vercel's Git integration —
   see _Deploying_ below. A private household ledger does not want a preview URL minted
   for every push, and a deploy ought to be something somebody asked for.

5. **First visit** offers to create the first account. Everyone after that arrives by
   invite, from Settings.

Nothing else changes: the same SQL runs on PGlite and on Postgres through the `Db` port.

### While you are in the Supabase dashboard

- **Database → Backups**: turn on point-in-time recovery if the plan allows it.
- **Authentication**: unused. Accounts live in this app's own `users` table.
- **API keys**: unused. Nothing reaches Supabase except Postgres over the connection string,
  so the anon and service keys never need to leave the dashboard.

Enable **point-in-time recovery** on the hosted database. Once a month, also take a local
copy — a provider account is a single point of failure:

```bash
pg_dump "$DATABASE_URL" --no-owner --format=custom > even-keel-$(date +%F).dump
```

Restore into an empty database with:

```bash
pg_restore --no-owner --dbname "$DATABASE_URL" even-keel-YYYY-MM-DD.dump
```

## Deploying

One repository secret, then it is a button.

**Once, by hand** — GitHub → the repository → Settings → Secrets and variables →
Actions → New repository secret:

| Secret         | Where it comes from                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| `VERCEL_TOKEN` | vercel.com/account/tokens → Create Token. Scope it to this account; no expiry needed.                                 |
| `DATABASE_URL` | Optional. The Supabase pooler string. Skip it to keep the connection string only in Vercel, and set it there instead. |

**Every time after that** — Actions → _Deploy to Vercel_ → Run workflow:

- `production` off gives a preview URL. On aliases `your-app.vercel.app` —
  Vercel picked that name because `even-keel` was already taken by another account.
- `sync_env` on pushes `DATABASE_URL` from the repository secret into Vercel, and mints
  `SESSION_SECRET` if the project has none. Leave it off for an ordinary deploy: it is
  only needed the first time, or after the database password changes.

`SESSION_SECRET` is minted once and never rotated by a deploy. Changing it signs both of
you out, which is a thing to do deliberately and not a side effect of shipping a CSS fix.
Nothing echoes a secret: values are piped into the CLI rather than passed as arguments,
because an argument shows up in `ps` and in the run log.

_Vercel API Call_ is the escape hatch for what the CLI does not cover — reading a
project's settings, listing deployments, adding an alias. It prints the response, so
never point it at a path that returns a secret value.

### What the deployed app reads

| Variable         | What it is                                                      |
| ---------------- | --------------------------------------------------------------- |
| `DATABASE_URL`   | Postgres connection string — the pooled one, port 6543          |
| `SESSION_SECRET` | Long random string; changing it signs everyone out              |
| `PGLITE_DIR`     | Only to smoke-test a production build locally. Never in Vercel. |

Secrets live in Vercel and in `.env.local`, never in the repository. `VERCEL_TOKEN`, and
`DATABASE_URL` if you choose to keep a copy there, live in the repository's Actions
secrets — which is not the repository, but it is a second place the connection string
exists. Skipping the `DATABASE_URL` secret and setting it in Vercel directly keeps it to
one place, at the cost of doing that bit by hand.

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
