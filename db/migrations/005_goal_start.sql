-- A goal needs to know when it started, or "are we where we should be by now?"
-- has no answer. 001 stored the target and the number of months but not the
-- month the clock started, leaving `created_at` — a timestamp, in whatever
-- zone the server happens to keep — as the only anchor.
alter table goals add column start_month text;
update goals set start_month = to_char(created_at, 'YYYY-MM') where start_month is null;
alter table goals alter column start_month set not null;
