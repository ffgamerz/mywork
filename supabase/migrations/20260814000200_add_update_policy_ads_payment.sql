-- Migration: Add UPDATE policy for transfer link fields on ads_payment
-- The original ads_payment.sql only granted SELECT + INSERT; without an
-- UPDATE policy Supabase silently rejects UPDATE requests (no row written).

create policy "authenticated can update ads_payment" on ads_payment
  for update using (auth.uid() is not null);

select 'ads_payment UPDATE policy granted' as status;
