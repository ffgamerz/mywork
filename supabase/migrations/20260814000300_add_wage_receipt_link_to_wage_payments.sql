-- Migration: Add wage_receipt_link field to wage_payments
-- Stores Google Drive (or any) PDF link for each wage payment's receipt.

alter table wage_payments
  add column if not exists wage_receipt_link text;

-- If the table has RLS, ensure an UPDATE policy exists so the front-end
-- can persist edits to this column.
do $$
begin
  if not exists (
    select from pg_policies
    where tablename = 'wage_payments'
      and perm_check = 'UPDATE'
  ) then
    create policy "authenticated can update wage_payments"
      on wage_payments for update using (auth.uid() is not null);
  end if;
end $$;

comment on column wage_payments.wage_receipt_link is
  'Google Drive / hosted PDF link for the wage payment receipt.';

select 'wage_payments.wage_receipt_link added' as status;
