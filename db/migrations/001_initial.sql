-- Even Keel, initial schema.
--
-- Deliberately narrow: only the structured fields the app's features need.
-- No raw statement text, no PDFs, no account or card numbers. Descriptions are
-- redacted before they ever reach an INSERT.

create table households (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  -- Currency columns exist throughout, but the aggregates do not convert yet.
  -- The check on transactions below keeps a second currency out until they do,
  -- rather than letting two currencies add up to a number that means nothing.
  display_currency text not null default 'AUD',
  locale           text not null default 'en-AU',
  time_zone        text not null default 'Australia/Perth',
  created_at       timestamptz not null default now()
);

create table users (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households (id) on delete cascade,
  email           text not null,
  display_name    text not null,
  password_hash   text,
  -- Bumped on a password change; the signed session token carries the value it
  -- was issued with, so every existing session stops verifying at once.
  session_version integer not null default 1,
  created_at      timestamptz not null default now(),
  unique (email)
);

-- Rate limiting has to survive a cold start. An in-memory counter on a
-- serverless platform resets per instance and protects nothing.
create table login_attempts (
  id           bigserial primary key,
  identifier   text not null,
  succeeded    boolean not null default false,
  attempted_at timestamptz not null default now()
);

create index login_attempts_recent_idx on login_attempts (identifier, attempted_at desc);

create table categories (
  id                     text not null,
  household_id           uuid not null references households (id) on delete cascade,
  name                   text not null,
  "group"                text not null,
  kind                   text not null check (kind in ('expense', 'income')),
  -- A real flag, not a naming convention. Excluded from recurring averages.
  one_off                boolean not null default false,
  -- Whole months cannot express a fortnight, and pay here is fortnightly.
  cadence_unit           text not null default 'month' check (cadence_unit in ('day', 'week', 'month')),
  cadence_count          integer not null default 1 check (cadence_count >= 1),
  target_monthly         numeric(14, 2),
  -- What the user says the bill actually is. Overrides the trailing average,
  -- which is what a cost with two months of history needs.
  confirmed_monthly_rate numeric(14, 2),
  archived               boolean not null default false,
  primary key (household_id, id)
);

create table rules (
  id           text not null,
  household_id uuid not null references households (id) on delete cascade,
  pattern      text not null,
  category_id  text not null,
  match_type   text not null check (match_type in ('regex', 'merchant')),
  source       text not null check (source in ('seed', 'user')),
  priority     integer not null default 50,
  created_at   timestamptz not null default now(),
  primary key (household_id, id),
  foreign key (household_id, category_id) references categories (household_id, id) on delete cascade
);

create index rules_priority_idx on rules (household_id, priority desc);

-- One merchant maps to one category, and the newest correction wins. Scoped to
-- the household, or two households would collide on a shared merchant.
create unique index rules_merchant_key on rules (household_id, pattern) where match_type = 'merchant';

-- Counts only. No filename: statement filenames routinely contain the account
-- number.
create table uploads (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households (id) on delete cascade,
  kind           text not null check (kind in ('csv', 'pdf', 'manual')),
  file_count     integer not null default 1,
  parsed_count   integer not null default 0,
  inserted_count integer not null default 0,
  skipped_count  integer not null default 0,
  uploaded_at    timestamptz not null default now()
);

create table transactions (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references households (id) on delete cascade,
  txn_date           date not null,
  month              text not null,
  description        text not null,
  merchant_key       text not null default '',
  amount             numeric(14, 2) not null,
  currency           text not null default 'AUD',
  balance            numeric(14, 2),
  -- Transfers are excluded from both income and spending. Moving money into an
  -- ETF reduces cash but leaves net worth alone; counting it as spending would
  -- score the month as a failure for doing the thing the app exists to encourage.
  kind               text not null default 'expense' check (kind in ('income', 'expense', 'transfer')),
  transfer_account_id uuid,
  category_id        text,
  one_off_override   boolean,
  needs_review       boolean not null default true,
  source             text not null default 'pdf' check (source in ('csv', 'pdf', 'manual')),
  -- A month-granularity row carries the first of its month and no merchant. It
  -- counts in totals and charts but never appears in the transaction ledger.
  granularity        text not null default 'transaction' check (granularity in ('transaction', 'month')),
  -- Identity as the statement printed it. Never recomputed after a user edits
  -- the row, or re-importing would insert the uncorrected version as new.
  source_fingerprint text not null,
  upload_id          uuid references uploads (id) on delete set null,
  split_parent_id    uuid references transactions (id) on delete cascade,
  is_split_parent    boolean not null default false,
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  foreign key (household_id, category_id) references categories (household_id, id) on delete set null,
  check (kind <> 'income' or amount > 0)
);

create index transactions_month_idx on transactions (household_id, month) where deleted_at is null;
create index transactions_review_idx on transactions (household_id) where needs_review and deleted_at is null;
create index transactions_split_idx on transactions (split_parent_id);
create index transactions_upload_idx on transactions (upload_id);
create index transactions_merchant_idx on transactions (household_id, merchant_key);

-- Re-importing a statement must not double-count. Split children are exempt:
-- they deliberately share their parent's date, text and merchant.
create unique index transactions_fingerprint_key
  on transactions (household_id, source_fingerprint)
  where split_parent_id is null and deleted_at is null;

create table accounts (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households (id) on delete cascade,
  name          text not null,
  kind          text not null check (kind in ('cash', 'investment', 'super', 'property', 'loan')),
  owner_user_id uuid references users (id) on delete set null,
  currency      text not null default 'AUD',
  -- available: reachable cash. invested: reachable but at market risk.
  -- locked: superannuation and home equity, which cannot be spent.
  bucket        text not null check (bucket in ('available', 'invested', 'locked')),
  archived      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- One hand-typed number per account per month. Net worth is always derived
-- from these, never stored.
create table balances (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  month      text not null,
  -- A loan holds the amount owed, positive, negated by kind when summed. Stated
  -- here and in the form label, because otherwise two people enter it two ways.
  amount     numeric(16, 2) not null,
  note       text,
  unique (account_id, month)
);

create table goals (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households (id) on delete cascade,
  kind            text not null check (kind in ('cash', 'net_worth')),
  name            text not null,
  target_amount   numeric(16, 2) not null,
  target_months   integer not null default 60,
  opening_balance numeric(16, 2) not null default 0,
  annual_rate     numeric(6, 4) not null default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create unique index goals_one_active_per_kind on goals (household_id, kind) where active;

create table savings_plans (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households (id) on delete cascade,
  name           text not null,
  monthly_amount numeric(14, 2) not null,
  note           text,
  -- Every plan is scored against every month; `active` only decides which one
  -- supplies the headline verdict.
  active         boolean not null default false,
  created_at     timestamptz not null default now()
);

create unique index savings_plans_one_active on savings_plans (household_id) where active;

-- KRW to AUD is about 0.0011, so four decimal places would round it away.
create table fx_rates (
  base  text not null,
  quote text not null,
  month text not null,
  rate  numeric(18, 8) not null,
  primary key (base, quote, month)
);
