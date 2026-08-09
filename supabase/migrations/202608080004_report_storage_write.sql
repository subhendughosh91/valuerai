create policy "private report writes" on storage.objects for insert with check (bucket_id = 'valuation-reports' and (public.is_admin() or owner = auth.uid()));
