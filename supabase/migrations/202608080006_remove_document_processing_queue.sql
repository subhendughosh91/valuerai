-- OCR is intentionally synchronous: the upload completion request calls OpenAI
-- and waits for its result. Remove the unused asynchronous queue introduced in
-- the previous migration.
drop trigger if exists valuation_document_queued_for_processing on public.valuation_documents;
drop function if exists public.enqueue_document_processing_job();
drop function if exists public.claim_document_processing_jobs(text, integer);
drop table if exists public.document_processing_jobs;
drop type if exists public.document_processing_job_status;
