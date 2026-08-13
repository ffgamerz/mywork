-- supabase/migrations/20260807203631_create_receipt_files_table.sql
CREATE TABLE public.receipt_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id BIGINT NOT NULL REFERENCES public.receipts_payment(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL UNIQUE, -- path to file in storage bucket
  original_filename TEXT NOT NULL,
  uploaded_by UUID REFERENCES public.profiles(id),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comment for clarity
COMMENT ON TABLE public.receipt_files IS 'Stores metadata for PDF receipt files uploaded against a payment.';
COMMENT ON COLUMN public.receipt_files.file_path IS 'Path to the uploaded PDF file in the Supabase Storage bucket.';