-- Household finance tracker — schema.
--
-- Deliberately narrow: only the structured fields the app's features need.
-- No raw statement text, no PDFs, no account/BSB/card numbers. Descriptions
-- are redacted before they ever reach an INSERT.

create extension if not exists "pgcrypto";

create table if not exists categories (
  id                     text primary key,
  name                   text not null,
  "group"                text not null,
  kind                   text not null check (kind in ('expense', 'income')),
  -- A real flag, not a naming convention. Excluded from recurring averages.
  one_off                boolean not null default false,
  -- Whole months cannot express a fortnight, and pay here is fortnightly.
  cadence_unit           text not null default 'month' check (cadence_unit in ('day', 'week', 'month')),
  cadence_count          integer not null default 1 check (cadence_count >= 1),
  target_monthly         numeric(12, 2),
  -- Overrides the trailing average until enough history exists to trust it.
  confirmed_monthly_rate numeric(12, 2),
  archived               boolean not null default false
);

create table if not exists rules (
  id          text primary key,
  pattern     text not null,
  category_id text not null references categories (id) on delete cascade,
  match_type  text not null check (match_type in ('regex', 'merchant')),
  source      text not null check (source in ('seed', 'user')),
  priority    integer not null default 50,
  created_at  timestamptz not null default now()
);

create index if not exists rules_priority_idx on rules (priority desc);
create unique index if not exists rules_user_merchant_key
  on rules (pattern) where match_type = 'merchant';

create table if not exists transactions (
  id                uuid primary key default gen_random_uuid(),
  txn_date          date not null,
  month             text not null,
  description       text not null,
  merchant_key      text not null default '',
  amount            numeric(12, 2) not null,
  balance           numeric(12, 2),
  category_id       text references categories (id) on delete set null,
  -- null = inherit the category's default one-off flag.
  one_off_override  boolean,
  needs_review      boolean not null default true,
  split_parent_id   uuid references transactions (id) on delete cascade,
  is_split_parent   boolean not null default false,
  fingerprint       text not null,
  created_at        timestamptz not null default now()
);

create index if not exists transactions_month_idx on transactions (month);
create index if not exists transactions_review_idx on transactions (needs_review) where needs_review;
create index if not exists transactions_split_idx on transactions (split_parent_id);
-- Re-uploading the same statement must not double-count. Split children are
-- exempt: they intentionally share their parent's date, text and merchant.
create unique index if not exists transactions_fingerprint_key
  on transactions (fingerprint) where split_parent_id is null;

create table if not exists savings_plans (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  monthly_amount   numeric(12, 2) not null,
  annual_rate      numeric(6, 4) not null default 0,
  starting_balance numeric(14, 2) not null default 0,
  goal_amount      numeric(14, 2) not null,
  goal_years       integer not null default 5,
  active           boolean not null default false,
  created_at       timestamptz not null default now()
);

create unique index if not exists savings_plans_one_active
  on savings_plans (active) where active;

-- Counts only. No filename: statement filenames routinely contain the
-- account number.
create table if not exists uploads (
  id             uuid primary key default gen_random_uuid(),
  uploaded_at    timestamptz not null default now(),
  parsed_count   integer not null,
  inserted_count integer not null,
  skipped_count  integer not null
);
