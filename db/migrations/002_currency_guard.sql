-- The aggregates do not convert currencies yet. Until they do, a second
-- currency in the ledger would silently add ₩500,000 to A$3,000 and report
-- 503,000 of nothing. This closes the door at the database rather than trusting
-- the UI to keep it shut, and comes out when conversion lands.
create or replace function transaction_currency_matches_household()
returns trigger as $$
declare
  household_currency text;
begin
  select display_currency into household_currency
    from households where id = new.household_id;

  if new.currency is distinct from household_currency then
    raise exception
      'transaction currency % does not match the household display currency %',
      new.currency, household_currency;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger transactions_currency_guard
  before insert or update of currency, household_id on transactions
  for each row execute function transaction_currency_matches_household();
