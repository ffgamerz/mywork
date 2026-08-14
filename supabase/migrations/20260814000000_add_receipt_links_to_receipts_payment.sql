-- Migration: Add bank_receipt_link & purchase_receipt_link to receipts_payment
-- Stores Google Drive (or any) PDF links for each payment's bank & purchase receipts.

-- Step 1: Add bank_receipt_link column (nullable — not every payment has one yet)
alter table receipts_payment
  add column if not exists bank_receipt_link text;

-- Step 2: Add purchase_receipt_link column (nullable)
alter table receipts_payment
  add column if not exists purchase_receipt_link text;

-- Step 3: Enable read for authenticated users (column-level is covered by row policy,
--         but keep the read policy explicit via the existing row policy).
comment on column receipts_payment.bank_receipt_link is
  'Google Drive / hosted PDF link for the bank transfer receipt image.';
comment on column receipts_payment.purchase_receipt_link is
  'Google Drive / hosted PDF link for the purchase invoice receipt image.';

-- Verify
select 'receipts_payment.bank_receipt_link + purchase_receipt_link added' as status;
