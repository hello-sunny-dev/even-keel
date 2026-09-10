# Even Keel — what it is and why

> _Net worth for two._

## The question

Once a month, two people want one question answered: **are we on track to grow our
assets?** Not "did we overspend on coffee" — whether the household is moving toward a
number it set for itself, and by how much it missed or cleared.

## Who it is for

Two partners, one household, one household, one private URL. Not a product, not a
sign-up, no third user. Any design choice that would only make sense with a thousand
users is the wrong choice here.

The schema carries a `household_id` and real user accounts anyway, because adding them
later would mean rewriting every query, while adding them now costs a column. That is
insurance, not a roadmap.

## The idea it is built around

In a couple, one person tends to play **offense** — investing, ETFs, growth — and the
other plays **defense** — spending discipline, saving out of a fixed income. Almost every
finance app models defense only, and in doing so it _punishes_ offense: moving $1,000
into an ETF leaves the bank account, so the month scores as a failure. An app built to
grow assets must not penalise the act of growing them.

So Even Keel shows both, side by side, on the same screen:

- **Defense** — savings rate, and how the month landed against each savings scenario
- **Offense** — contributed, gain or loss, return

## What it does

1. **Import** — several bank statements at once (CSV where the bank offers it, PDF
   otherwise), or a single transaction typed in, or a whole month entered at category
   level when a statement has not arrived yet. Nothing is written until an editable
   confirm table has been reviewed.
2. **Categorise** — rules match merchant text; anything ambiguous goes to a review queue
   rather than being guessed at. A correction is remembered by merchant and applied to
   that merchant's history.
3. **Separate one-off from recurring** — as a real flag on the data, not a naming
   convention. A house settlement must not distort next month's budget.
4. **Score the month against every savings scenario** — Minimum, Moderate, Aggressive —
   not only the active one. A month that misses Aggressive but clears Moderate should
   read as exactly that.
5. **Track net worth** — cash, investments, superannuation, property and loans, from
   monthly balances entered by hand. Split into **available / invested / locked**, because
   super cannot be spent and pretending otherwise flatters the savings plan.
6. **Project** — real months first, then the active scenario, against two goals: a cash
   target and a net-worth target, each with its own horizon.

## What is deliberately not built

- **Bank feeds.** They cost money per user through an aggregator, and no aggregator spans
  both countries this household has money in. Manual entry is the honest answer here.
- **Sign-up, invitations, billing, marketing.**
- **An LLM in the parsing path.** See `ARCHITECTURE.md`.
- **A native app.** Responsive web plus a PWA manifest gives a home-screen icon without
  App Store review.
- **Anything gamified.** No streaks, no nudges, no mascots. It is a ledger.

## Constraints that are not negotiable

- **The repository is private, and the deployed URL is gated.** Every route sits behind
  a login.
- **Uploaded statements are never stored.** Parsed in memory, discarded; only the
  extracted fields persist.
- **No account numbers, BSBs or card numbers reach the database or a log**, even though
  they appear in statement text. They are stripped before anything is written.
- This is proportionate care for a small private tool. It is not a claim of bank-grade
  compliance.

## How we know it works

A month's figures are checked against hand-calculated values, and an imported statement
must reconcile: opening balance plus every parsed amount equals the closing balance. When
several statements are imported together, each one's opening balance must equal the
previous one's closing balance, so a missing statement is named rather than absorbed.
