import { FunctionsHttpError } from '@supabase/supabase-js'

// Extract a human-readable message from Supabase errors.
// Edge Function non-2xx responses hide the real reason inside err.context.
export async function getErrorMessage(err) {
  if (err instanceof FunctionsHttpError) {
    const data = await err.context.json().catch(() => null)
    return data?.error || data?.message || data?.msg || `Edge function failed (HTTP ${err.status || '?'})`
  }
  return err?.message || 'Unexpected error'
}
