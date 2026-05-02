begin;

alter table if exists public.invites enable row level security;

drop policy if exists "Anyone can read invite by token" on public.invites;
drop policy if exists "Admins and CMs can view invites" on public.invites;
drop policy if exists "Admins can manage invites" on public.invites;
drop policy if exists "invites_admin_all" on public.invites;

create policy "invites_admin_all" on public.invites
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

alter table if exists public.cm_activities enable row level security;

drop policy if exists "Admins can view all CM activities" on public.cm_activities;
drop policy if exists "CMs and Admins can log activities" on public.cm_activities;
drop policy if exists "CMs can view their own activities" on public.cm_activities;
drop policy if exists "ca_select_admin" on public.cm_activities;
drop policy if exists "ca_select_own" on public.cm_activities;
drop policy if exists "ca_insert_service" on public.cm_activities;
drop policy if exists "cm_activities_select" on public.cm_activities;
drop policy if exists "cm_activities_insert_staff" on public.cm_activities;

create policy "cm_activities_select" on public.cm_activities
for select to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or (
    public.has_role(auth.uid(), 'content_manager')
    and exists (
      select 1
      from public.team_members tm
      where tm.profile_id = auth.uid()
        and (
          tm.id = cm_activities.cm_id
          or tm.profile_id = cm_activities.cm_user_id
          or lower(coalesce(tm.email, '')) = lower(coalesce(cm_activities.cm_email, ''))
        )
    )
  )
);

create policy "cm_activities_insert_staff" on public.cm_activities
for insert to authenticated
with check (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'content_manager')
);

commit;
