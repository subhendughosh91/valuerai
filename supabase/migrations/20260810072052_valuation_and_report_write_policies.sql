-- Allow authenticated valuation owners (and the global Admin) to persist and
-- retry deterministic calculation results. The existing SELECT policy remains
-- authoritative for reads.
-- Report rows remain server-write-only through the protected admin client;
-- end users receive no direct INSERT or UPDATE policy on public.reports.

drop policy if exists "calculations valuation owner or admin insert" on public.valuation_calculations;
create policy "calculations valuation owner or admin insert"
on public.valuation_calculations
for insert
to authenticated
with check (
  exists (
    select 1
    from public.valuations v
    where v.id = valuation_calculations.valuation_id
      and (v.user_id = (select auth.uid()) or (select public.is_admin()))
  )
);

drop policy if exists "calculations valuation owner or admin update" on public.valuation_calculations;
create policy "calculations valuation owner or admin update"
on public.valuation_calculations
for update
to authenticated
using (
  exists (
    select 1
    from public.valuations v
    where v.id = valuation_calculations.valuation_id
      and (v.user_id = (select auth.uid()) or (select public.is_admin()))
  )
)
with check (
  exists (
    select 1
    from public.valuations v
    where v.id = valuation_calculations.valuation_id
      and (v.user_id = (select auth.uid()) or (select public.is_admin()))
  )
);

drop policy if exists "calculations valuation owner or admin delete" on public.valuation_calculations;
create policy "calculations valuation owner or admin delete"
on public.valuation_calculations
for delete
to authenticated
using (
  exists (
    select 1
    from public.valuations v
    where v.id = valuation_calculations.valuation_id
      and (v.user_id = (select auth.uid()) or (select public.is_admin()))
  )
);
