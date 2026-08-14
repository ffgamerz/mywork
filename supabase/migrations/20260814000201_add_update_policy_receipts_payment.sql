-- Migration: Add UPDATE policy for receipt link fields on receipts_payment
-- The original receipts_payment.sql only granted SELECT + INSERT; without an
-- UPDATE policy Supabase silently rejects UPDATE requests (no row written).

create policy "authenticated can update receipts_payment" on receipts_payment
  for update using (auth.uid() is not null);

select 'receipts_payment UPDATE policy granted' as status;
