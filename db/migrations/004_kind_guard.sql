-- The guard on income already exists — it just does not say its own name.
--
-- 001 wrote it as an unnamed table-level check, so PostgreSQL called it
-- `transactions_check`, and a violation reports that instead of what was
-- actually wrong. The rule it enforces is the one the aggregates now depend
-- on: `kind` decides income from expense, never the sign of the amount. A
-- refund is a positive amount in an expense category and must stay one;
-- income is money coming in and cannot be zero or negative.
alter table transactions rename constraint transactions_check to transactions_income_is_positive;
