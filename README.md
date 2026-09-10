# Even Keel

**Net worth for two.** A private household tracker for two people: import bank
statements, categorise what they contain, and see whether the month cleared the bar —
and whether the net worth is going where it needs to.

Not a product. Two named users, one private URL, no sign-up.

## Start here

|                                              |                                                                                                                                                                                                          |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[docs/PLAN.md](docs/PLAN.md)**             | The implementation plan — data model, screens, commit sequence, tests. **Read this first.** It also lists four known defects in the existing library (B1–B4) that must be fixed before building on them. |
| [docs/PRD.md](docs/PRD.md)                   | What it is for and what is deliberately not built                                                                                                                                                        |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How parsing, dates, money and the database layer work, and why                                                                                                                                           |
| [docs/DECISIONS.md](docs/DECISIONS.md)       | Decisions and their reasons, so they are not re-litigated                                                                                                                                                |
| [docs/RUNBOOK.md](docs/RUNBOOK.md)           | Setup, database, deploy, backups, diagnosing a statement                                                                                                                                                 |

## Quick start

```bash
nvm use && npm install
cp .env.example .env.local
npm test
npm run dev
```

## Privacy

This holds real financial data, so:

- Uploaded statements are **parsed in memory and discarded**. The bytes are never written
  to disk or to the database.
- Account numbers, BSBs and card numbers are **stripped before anything is stored**, even
  though they appear in statement text.
- Every route sits behind a login; the app is never indexed.
- Real statements live in `test-fixtures/real/`, which is gitignored, and stay local.
- No third-party analytics. No model is called in the default build.

This is proportionate care for a small private tool — not a claim of bank-grade
compliance. What it guards against is the repository or database leaking more than the
minimum, and the deployed URL being usable by anyone else.
