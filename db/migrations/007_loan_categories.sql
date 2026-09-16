-- Two categories the taxonomy was missing, added to every household that
-- already exists.
--
-- `seedCategories` only runs when a household is created, so a category added
-- to the seed array afterwards never reaches anyone already using the app.
-- These two are needed to read a home-loan statement at all: the interest is
-- the part of a mortgage that actually leaves the household, and the annual
-- package fee is a bank charge rather than a cost of living.
insert into categories (id, household_id, name, "group", kind, one_off, cadence_unit, cadence_count)
select 'mortgage-interest', h.id, 'Mortgage Interest', 'Mortgage', 'expense', false, 'month', 1
  from households h
on conflict (household_id, id) do nothing;

insert into categories (id, household_id, name, "group", kind, one_off, cadence_unit, cadence_count)
select 'other-bank-fees', h.id, 'Bank Fees', 'Other', 'expense', false, 'month', 12
  from households h
on conflict (household_id, id) do nothing;
