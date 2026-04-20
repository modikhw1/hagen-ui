begin;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_concepts_updated_at on public.concepts;
create trigger trg_concepts_updated_at
before update on public.concepts
for each row execute function public.set_updated_at();

-- No TikTok OAuth trigger is created in the provider/profile-URL model.

commit;
