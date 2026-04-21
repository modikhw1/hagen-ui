begin;

create index if not exists customer_profiles_created_at_desc
  on public.customer_profiles (created_at desc);

create index if not exists attention_snoozes_subject_active_lookup
  on public.attention_snoozes (subject_id)
  where released_at is null;

create index if not exists cm_assignments_active_customer_idx
  on public.cm_assignments (customer_id)
  where valid_to is null;

create or replace function public.admin_get_customer_detail(p_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'profile', to_jsonb(cp),
    'buffer_row', (
      select to_jsonb(vb)
      from public.v_customer_buffer vb
      where vb.customer_id = cp.id
    ),
    'attention_snoozes', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.snoozed_at desc)
      from public.attention_snoozes s
      where s.subject_type in ('onboarding', 'customer_blocking')
        and s.subject_id = cp.id::text
        and s.released_at is null
    ), '[]'::jsonb),
    'coverage_absences', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ca.id,
          'cm_id', ca.cm_id,
          'cm_name', cm.name,
          'backup_cm_id', ca.backup_cm_id,
          'backup_cm_name', backup.name,
          'absence_type', ca.absence_type,
          'compensation_mode', ca.compensation_mode,
          'starts_on', ca.starts_on,
          'ends_on', ca.ends_on,
          'note', ca.note,
          'is_active', ca.starts_on <= current_date and ca.ends_on >= current_date,
          'is_upcoming', ca.starts_on > current_date
        )
        order by ca.starts_on desc
      )
      from (
        select
          id,
          cm_id,
          backup_cm_id,
          absence_type,
          compensation_mode,
          starts_on,
          ends_on,
          note
        from public.cm_absences
        where customer_profile_id = cp.id
        order by starts_on desc
        limit 10
      ) ca
      left join public.team_members cm on cm.id = ca.cm_id
      left join public.team_members backup on backup.id = ca.backup_cm_id
    ), '[]'::jsonb)
  )
  from public.customer_profiles cp
  where cp.id = p_id;
$$;

grant execute on function public.admin_get_customer_detail(uuid) to authenticated;
grant execute on function public.admin_get_customer_detail(uuid) to service_role;

commit;
