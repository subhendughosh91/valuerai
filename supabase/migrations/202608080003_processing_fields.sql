alter table public.valuation_documents add column ocr_text text;
alter table public.valuation_documents add column ocr_completed_at timestamptz;
alter table public.valuation_documents add column processing_metadata jsonb not null default '{}'::jsonb;
