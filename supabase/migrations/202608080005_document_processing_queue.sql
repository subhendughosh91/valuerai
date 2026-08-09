create type public.document_processing_job_status as enum ('QUEUED', 'RUNNING', 'COMPLETE', 'FAILED');

create table public.document_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.valuation_documents(id) on delete cascade,
  valuation_id uuid not null references public.valuations(id) on delete cascade,
  status public.document_processing_job_status not null default 'QUEUED',
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 3),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index document_processing_jobs_next_job_idx on public.document_processing_jobs(status, available_at, created_at);
create trigger document_processing_jobs_updated before update on public.document_processing_jobs for each row execute procedure public.set_updated_at();

create or replace function public.enqueue_document_processing_job()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.document_processing_jobs (document_id, valuation_id)
  values (new.id, new.valuation_id)
  on conflict (document_id) do nothing;
  return new;
end; $$;

create trigger valuation_document_queued_for_processing
after insert on public.valuation_documents
for each row execute procedure public.enqueue_document_processing_job();

create or replace function public.claim_document_processing_jobs(worker_name text, batch_size integer default 1)
returns setof public.document_processing_jobs
language plpgsql security definer set search_path = public as $$
begin
  update public.document_processing_jobs
  set status = 'QUEUED', locked_at = null, locked_by = null, available_at = now()
  where status = 'RUNNING' and locked_at < now() - interval '15 minutes';

  return query
  with candidates as (
    select id
    from public.document_processing_jobs
    where status = 'QUEUED' and available_at <= now() and attempts < 3
    order by available_at, created_at
    limit greatest(batch_size, 1)
    for update skip locked
  )
  update public.document_processing_jobs job
  set status = 'RUNNING', attempts = job.attempts + 1, locked_at = now(), locked_by = worker_name
  from candidates
  where job.id = candidates.id
  returning job.*;
end; $$;

alter table public.document_processing_jobs enable row level security;
