-- Idit uploads raw recordings from the admin screen, so `authenticated` needs
-- to be able to write to the `incoming` bucket and record an ingest job.
-- Everything here is still gated on is_admin(); students get nothing new.

grant insert, update on public.ingest_jobs to authenticated;

create policy "Admins create ingest jobs"
    on ingest_jobs for insert to authenticated
    with check (public.is_admin(auth.uid()));
create policy "Admins update ingest jobs"
    on ingest_jobs for update to authenticated
    using (public.is_admin(auth.uid()));

-- Storage has its own RLS on storage.objects. The `lessons` bucket stays
-- untouched: only service_role writes the encrypted segments, and reads happen
-- through signed URLs minted by the hls function, never by the client.
create policy "Admins upload raw recordings"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'incoming' and public.is_admin(auth.uid()));

create policy "Admins read raw recordings"
    on storage.objects for select to authenticated
    using (bucket_id = 'incoming' and public.is_admin(auth.uid()));

create policy "Admins replace raw recordings"
    on storage.objects for update to authenticated
    using (bucket_id = 'incoming' and public.is_admin(auth.uid()));

create policy "Admins delete raw recordings"
    on storage.objects for delete to authenticated
    using (bucket_id = 'incoming' and public.is_admin(auth.uid()));
