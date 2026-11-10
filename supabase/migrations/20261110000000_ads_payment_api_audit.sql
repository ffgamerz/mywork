-- Migration: audit and note columns for ads_payment written by the Mywork API
-- (POST/PATCH/DELETE /api/v1/ads-payments). Idempotent.
-- The API inserts/updates these columns, so apply this before using the write path.

alter table ads_payment
  add column if not exists reference text,
  add column if not exists notes text,
  add column if not exists created_by text,
  add column if not exists updated_by text,
  add column if not exists updated_at timestamptz;

comment on column ads_payment.reference is
  'Optional payment reference (for example a bank transfer reference), entered through the API.';
comment on column ads_payment.notes is
  'Optional free-text notes about the payment.';
comment on column ads_payment.created_by is
  'Actor that created the payment through the API: bot:<BOT_KEY_NAME> or user:<auth uuid>.';
comment on column ads_payment.updated_by is
  'Actor that last changed the payment through the API: bot:<BOT_KEY_NAME> or user:<auth uuid>.';
comment on column ads_payment.updated_at is
  'Timestamp of the last API change to the payment or to its linked records.';

select 'ads_payment reference, notes, created_by, updated_by, updated_at added' as status;
