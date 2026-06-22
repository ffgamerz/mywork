import { createClient } from '@supabase/supabase-js'

// Letakkan URL dan ANON_KEY projek baharu anda terus di sini
const supabaseUrl = 'https://wvpqllnpataysjqufumy.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2cHFsbG5wYXRheXNqcXVmdW15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMjYzNjksImV4cCI6MjA5NzcwMjM2OX0.TSDZ7SXjcTD6IzUGDVGWEDjcc0rrXeCEC_P-23DCXsk'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)