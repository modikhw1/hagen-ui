-- Manual migration: create public 'avatars' storage bucket for CM profile pictures.
-- Apply via your normal SQL workflow (e.g. supabase db push or direct psql).

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public read access on avatars'
  ) then
    create policy "Public read access on avatars"
      on storage.objects for select
      to public
      using (bucket_id = 'avatars');
  end if;
end$$;
