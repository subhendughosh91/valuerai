create extension if not exists "pgcrypto";

create type public.app_role as enum ('USER', 'ADMIN');
create type public.valuation_status as enum ('DRAFT', 'UPLOADING', 'EXTRACTING', 'REVIEW_REQUIRED', 'VALUING', 'COMPLETE', 'FAILED', 'DISCARDED');
create type public.document_kind as enum ('SALE_DEED', 'KHATIYAN', 'BUILDING_PLAN', 'SALE_AGREEMENT', 'RS_HAL_DAG_MAP', 'GOVT_GUIDELINE_RATE', 'ELECTRICITY_BILL', 'MUNICIPAL_TAX', 'KYC', 'OTHER');
create type public.rule_kind as enum ('EXTRACTION', 'VALUATION', 'LAND');

create table public.states (
  code text primary key,
  name text not null unique,
  country text not null default 'India' check (country = 'India'),
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.states (code, name, enabled) values ('TR', 'Tripura', true);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'USER',
  display_name text not null,
  phone text,
  address text not null,
  state_code text not null references public.states(code),
  country text not null default 'India' check (country = 'India'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'ADMIN') $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, display_name, phone, address, state_code)
  values (
    new.id,
    case when lower(new.email) = lower(coalesce(current_setting('app.owner_admin_email', true), '')) then 'ADMIN'::public.app_role else 'USER'::public.app_role end,
    coalesce(new.raw_user_meta_data ->> 'display_name', 'ValuerAI User'),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'address', ''), 'Not provided'),
    coalesce(nullif(new.raw_user_meta_data ->> 'state_code', ''), 'TR')
  );
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create table public.state_rule_versions (
  id uuid primary key default gen_random_uuid(),
  state_code text not null references public.states(code),
  kind public.rule_kind not null,
  version integer not null,
  content text not null,
  status text not null check (status in ('DRAFT', 'PUBLISHED', 'RETIRED')) default 'DRAFT',
  published_at timestamptz,
  published_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (state_code, kind, version)
);

create unique index one_published_rule_per_kind on public.state_rule_versions (state_code, kind) where status = 'PUBLISHED';

create table public.valuations (
  id uuid primary key default gen_random_uuid(),
  reference_no text not null unique default ('VAL-TR-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  user_id uuid not null references public.profiles(id) on delete restrict,
  state_code text not null references public.states(code),
  status public.valuation_status not null default 'DRAFT',
  property_label text,
  extraction_data jsonb not null default '{}'::jsonb,
  approved_data jsonb,
  extraction_rule_id uuid references public.state_rule_versions(id),
  valuation_rule_id uuid references public.state_rule_versions(id),
  land_rule_id uuid references public.state_rule_versions(id),
  processing_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  discarded_at timestamptz
);

create table public.valuation_documents (
  id uuid primary key default gen_random_uuid(),
  valuation_id uuid not null references public.valuations(id) on delete cascade,
  kind public.document_kind not null,
  other_document_types text[] not null default '{}',
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 26214400),
  sha256 text,
  scan_status text not null default 'PENDING' check (scan_status in ('PENDING', 'CLEAN', 'REJECTED', 'FAILED')),
  created_at timestamptz not null default now()
);

create table public.extraction_runs (
  id uuid primary key default gen_random_uuid(),
  valuation_id uuid not null references public.valuations(id) on delete cascade,
  status text not null check (status in ('QUEUED', 'RUNNING', 'COMPLETE', 'FAILED')) default 'QUEUED',
  model text not null,
  input_snapshot jsonb not null default '{}'::jsonb,
  output jsonb,
  evidence jsonb not null default '[]'::jsonb,
  contradictions jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  error text
);

create table public.valuation_calculations (
  id uuid primary key default gen_random_uuid(),
  valuation_id uuid not null unique references public.valuations(id) on delete cascade,
  input_snapshot jsonb not null,
  output jsonb not null,
  engine_version text not null default 'tripura-v1',
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  valuation_id uuid not null references public.valuations(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null default 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  template_version text not null default 'sbi-tripura-v1',
  created_at timestamptz not null default now(),
  generated_by uuid references public.profiles(id)
);

create table public.government_data_sources (
  id uuid primary key default gen_random_uuid(),
  state_code text not null references public.states(code),
  name text not null,
  url text not null,
  mode text not null check (mode in ('MANUAL', 'AUTOMATED', 'BOTH')) default 'BOTH',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.government_data_sources(state_code, name, url, mode) values
('TR', 'NGDRS Tripura guideline rate', 'https://ngdrs.tripura.gov.in/NGDRS_TR/', 'BOTH'),
('TR', 'Tripura Khatiyan search', 'https://jami.tripura.gov.in/EODB/citizen_search.aspx', 'BOTH'),
('TR', 'Tripura BhuNaksha map', 'https://bhunaksha.tripura.gov.in', 'BOTH');

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  valuation_id uuid references public.valuations(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger valuations_updated before update on public.valuations for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.states enable row level security;
alter table public.state_rule_versions enable row level security;
alter table public.valuations enable row level security;
alter table public.valuation_documents enable row level security;
alter table public.extraction_runs enable row level security;
alter table public.valuation_calculations enable row level security;
alter table public.reports enable row level security;
alter table public.government_data_sources enable row level security;
alter table public.audit_events enable row level security;

create policy "profiles self or admin" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles self update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
create policy "states readable" on public.states for select using (true);
create policy "states admin write" on public.states for all using (public.is_admin()) with check (public.is_admin());
create policy "rules readable published or admin" on public.state_rule_versions for select using (status = 'PUBLISHED' or public.is_admin());
create policy "rules admin write" on public.state_rule_versions for all using (public.is_admin()) with check (public.is_admin());
create policy "valuations owned or admin" on public.valuations for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "documents valuation owner or admin" on public.valuation_documents for all using (exists(select 1 from public.valuations v where v.id = valuation_id and (v.user_id = auth.uid() or public.is_admin()))) with check (exists(select 1 from public.valuations v where v.id = valuation_id and (v.user_id = auth.uid() or public.is_admin())));
create policy "extractions valuation owner or admin" on public.extraction_runs for select using (exists(select 1 from public.valuations v where v.id = valuation_id and (v.user_id = auth.uid() or public.is_admin())));
create policy "calculations valuation owner or admin" on public.valuation_calculations for select using (exists(select 1 from public.valuations v where v.id = valuation_id and (v.user_id = auth.uid() or public.is_admin())));
create policy "reports valuation owner or admin" on public.reports for select using (exists(select 1 from public.valuations v where v.id = valuation_id and (v.user_id = auth.uid() or public.is_admin())));
create policy "sources readable" on public.government_data_sources for select using (true);
create policy "sources admin write" on public.government_data_sources for all using (public.is_admin()) with check (public.is_admin());
create policy "audit admin read" on public.audit_events for select using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
('valuation-documents', 'valuation-documents', false, 26214400, array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/webp']),
('valuation-reports', 'valuation-reports', false, 26214400, array['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

create policy "private document paths" on storage.objects for all using (bucket_id = 'valuation-documents' and (public.is_admin() or owner = auth.uid())) with check (bucket_id = 'valuation-documents' and (public.is_admin() or owner = auth.uid()));
create policy "private report reads" on storage.objects for select using (bucket_id = 'valuation-reports' and (public.is_admin() or owner = auth.uid()));
