-- Migration: Add transfer link fields to ads_payment
-- Stores Google Drive (or any) PDF links for each payment's own-account
-- transfer & credit-card transfer receipts.

alter table ads_payment
  add column if not exists transfer_own_acc_link text;

alter table ads_payment
  add column if not exists transfer_cc_link text;

comment on column ads_payment.transfer_own_acc_link is
  'Google Drive / hosted PDF link for the own-account transfer receipt.';
comment on column ads_payment.transfer_cc_link is
  'Google Drive / hosted PDF link for the credit-card transfer receipt.';

select 'ads_payment.transfer_own_acc_link + transfer_cc_link added' as status;
