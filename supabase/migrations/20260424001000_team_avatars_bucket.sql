begin;

insert into storage.buckets (id, name, public)
values ('team-avatars', 'team-avatars', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "team_avatars_public_read" on storage.objects;
create policy "team_avatars_public_read"
on storage.objects
for select
to public
using (bucket_id = 'team-avatars');

drop policy if exists "team_avatars_admin_insert" on storage.objects;
create policy "team_avatars_admin_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'team-avatars'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_admin, false) = true
  )
);

drop policy if exists "team_avatars_admin_update" on storage.objects;
create policy "team_avatars_admin_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'team-avatars'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_admin, false) = true
  )
)
with check (
  bucket_id = 'team-avatars'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_admin, false) = true
  )
);

drop policy if exists "team_avatars_admin_delete" on storage.objects;
create policy "team_avatars_admin_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'team-avatars'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_admin, false) = true
  )
);

commit;
