-- Extraction runs are written by the authenticated valuation owner through
-- server routes that retain the user's Supabase session. Permit only records
-- belonging to that user's valuation, while preserving administrator access.

drop policy if exists "extractions valuation owner or admin insert" on public.extraction_runs;
create policy "extractions valuation owner or admin insert"
on public.extraction_runs
for insert
with check (
  exists (
    select 1
    from public.valuations v
    where v.id = valuation_id
      and (v.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "extractions valuation owner or admin update" on public.extraction_runs;
create policy "extractions valuation owner or admin update"
on public.extraction_runs
for update
using (
  exists (
    select 1
    from public.valuations v
    where v.id = valuation_id
      and (v.user_id = auth.uid() or public.is_admin())
  )
)
with check (
  exists (
    select 1
    from public.valuations v
    where v.id = valuation_id
      and (v.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "extractions valuation owner or admin delete" on public.extraction_runs;
create policy "extractions valuation owner or admin delete"
on public.extraction_runs
for delete
using (
  exists (
    select 1
    from public.valuations v
    where v.id = valuation_id
      and (v.user_id = auth.uid() or public.is_admin())
  )
);
