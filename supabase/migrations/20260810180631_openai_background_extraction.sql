create table public.ai_processing_steps (
  id uuid primary key default gen_random_uuid(),
  extraction_run_id uuid not null references public.extraction_runs(id) on delete cascade,
  valuation_id uuid not null references public.valuations(id) on delete cascade,
  document_id uuid references public.valuation_documents(id) on delete cascade,
  stage text not null check (stage in ('DOCUMENT_OCR', 'STRUCTURED_EXTRACTION')),
  status text not null default 'QUEUED' check (status in ('QUEUED', 'SUBMITTING', 'IN_PROGRESS', 'PROCESSING', 'COMPLETE', 'FAILED', 'CANCELLED')),
  openai_response_id text unique,
  model text not null,
  reasoning_effort text not null check (reasoning_effort in ('minimal', 'low', 'medium', 'high')),
  attempt integer not null default 1 check (attempt > 0 and attempt <= 3),
  error text,
  submitted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index ai_processing_steps_one_document_stage
  on public.ai_processing_steps (extraction_run_id, stage, document_id)
  where document_id is not null;

create unique index ai_processing_steps_one_run_stage
  on public.ai_processing_steps (extraction_run_id, stage)
  where document_id is null;

create index ai_processing_steps_valuation_idx on public.ai_processing_steps (valuation_id, created_at desc);
create index ai_processing_steps_run_status_idx on public.ai_processing_steps (extraction_run_id, status);
create index ai_processing_steps_document_idx on public.ai_processing_steps (document_id) where document_id is not null;
create index if not exists extraction_runs_valuation_started_idx on public.extraction_runs (valuation_id, started_at desc);
create index if not exists valuation_documents_valuation_idx on public.valuation_documents (valuation_id);

create table public.openai_webhook_events (
  webhook_id text primary key,
  event_id text not null unique,
  event_type text not null,
  response_id text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

alter table public.ai_processing_steps enable row level security;
alter table public.openai_webhook_events enable row level security;

grant select on public.ai_processing_steps to authenticated;
grant select, insert, update, delete on public.ai_processing_steps to service_role;
grant select, insert, update, delete on public.openai_webhook_events to service_role;
revoke all on public.ai_processing_steps from public, anon;
revoke all on public.openai_webhook_events from public, anon;
revoke insert, update, delete on public.ai_processing_steps from anon, authenticated;
revoke all on public.openai_webhook_events from anon, authenticated;

create policy "processing steps valuation owner or admin"
on public.ai_processing_steps
for select
to authenticated
using (
  exists (
    select 1
    from public.valuations v
    where v.id = valuation_id
      and (v.user_id = (select auth.uid()) or (select public.is_admin()))
  )
);

create or replace function public.claim_ai_document_steps(p_run_id uuid, p_concurrency integer default 2)
returns setof public.ai_processing_steps
language plpgsql
security invoker
set search_path = public
as $$
declare
  available_slots integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_run_id::text, 0));

  select greatest(
    least(p_concurrency, 2) - count(*)::integer,
    0
  )
  into available_slots
  from public.ai_processing_steps
  where extraction_run_id = p_run_id
    and stage = 'DOCUMENT_OCR'
    and status in ('SUBMITTING', 'IN_PROGRESS', 'PROCESSING');

  if available_slots = 0 then
    return;
  end if;

  return query
  update public.ai_processing_steps steps
  set status = 'SUBMITTING',
      started_at = coalesce(steps.started_at, now()),
      updated_at = now(),
      error = null
  where steps.id in (
    select queued.id
    from public.ai_processing_steps queued
    where queued.extraction_run_id = p_run_id
      and queued.stage = 'DOCUMENT_OCR'
      and queued.status = 'QUEUED'
    order by queued.created_at, queued.id
    for update skip locked
    limit available_slots
  )
  returning steps.*;
end;
$$;

revoke all on function public.claim_ai_document_steps(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_ai_document_steps(uuid, integer) to service_role;

create or replace function public.complete_background_extraction(
  p_run_id uuid,
  p_step_id uuid,
  p_output jsonb,
  p_evidence jsonb,
  p_contradictions jsonb,
  p_extraction_rule_id uuid,
  p_land_rule_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_valuation_id uuid;
  completed_at_value timestamptz := now();
begin
  select run.valuation_id
  into target_valuation_id
  from public.extraction_runs run
  where run.id = p_run_id
    and run.status = 'RUNNING'
  for update;

  if target_valuation_id is null then
    return false;
  end if;

  perform 1
  from public.valuations valuation
  where valuation.id = target_valuation_id
    and valuation.status = 'EXTRACTING'
  for update;
  if not found then
    return false;
  end if;

  perform 1
  from public.ai_processing_steps step
  where step.id = p_step_id
    and step.extraction_run_id = p_run_id
    and step.stage = 'STRUCTURED_EXTRACTION'
    and step.status = 'PROCESSING'
  for update;
  if not found then
    return false;
  end if;

  update public.valuations
  set status = 'REVIEW_REQUIRED',
      extraction_data = p_output,
      extraction_rule_id = p_extraction_rule_id,
      land_rule_id = p_land_rule_id,
      processing_error = null
  where id = target_valuation_id;

  update public.ai_processing_steps
  set status = 'COMPLETE',
      completed_at = completed_at_value,
      error = null
  where id = p_step_id;

  update public.extraction_runs
  set status = 'COMPLETE',
      output = p_output,
      evidence = p_evidence,
      contradictions = p_contradictions,
      completed_at = completed_at_value,
      error = null
  where id = p_run_id;

  return true;
end;
$$;

revoke all on function public.complete_background_extraction(uuid, uuid, jsonb, jsonb, jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_background_extraction(uuid, uuid, jsonb, jsonb, jsonb, uuid, uuid) to service_role;

create trigger ai_processing_steps_updated
before update on public.ai_processing_steps
for each row execute procedure public.set_updated_at();
