-- Accounts live in the database, not in an environment variable.
--
-- Not open registration: an account is created either by bootstrapping the
-- very first one, or by accepting an invite. Two kinds of invite cover what
-- this is actually for — a partner joining the household you already keep, and
-- someone else starting a household of their own.

create table invites (
  token        text primary key,
  kind         text not null check (kind in ('join', 'new_household')),
  -- Set for 'join', null for 'new_household' — there is no household yet.
  household_id uuid references households (id) on delete cascade,
  created_by   uuid references users (id) on delete set null,
  note         text,
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  accepted_by  uuid references users (id) on delete set null,
  created_at   timestamptz not null default now(),
  check ((kind = 'join') = (household_id is not null))
);

create index invites_household_idx on invites (household_id) where accepted_at is null;

-- Email is how you sign in, so compare it case-insensitively — nobody
-- remembers whether they capitalised it.
create unique index users_email_lower_key on users (lower(email));
