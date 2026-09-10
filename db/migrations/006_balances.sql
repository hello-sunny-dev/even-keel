-- What was added, alongside what it is worth.
--
-- Growth is the reason to track an investment account at all, and a balance
-- alone cannot tell growth from a deposit: an account that went from $10,000
-- to $10,500 either earned $500 or was paid $500 in, and those are opposite
-- facts about the same number. The person entering the balance knows which,
-- and it is one more field on a form they are already filling in.
alter table balances add column contributed numeric(16, 2) not null default 0;

-- A loan is stored as the amount owed, positive, and negated when net worth is
-- summed. Entered as a negative it would be added instead of subtracted, and a
-- $400,000 mortgage would read as $400,000 of wealth. The form says so, and so
-- does this.
create or replace function balances_sign_guard() returns trigger as $$
declare
  account_kind text;
begin
  select kind into account_kind from accounts where id = new.account_id;
  if account_kind = 'loan' and new.amount < 0 then
    raise exception 'a loan balance is the amount owed, entered positive (got %)', new.amount
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger balances_sign_guard_trigger
  before insert or update on balances
  for each row execute function balances_sign_guard();
