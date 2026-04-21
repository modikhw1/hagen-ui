create or replace view public.cm_temporary_coverage
with (security_invoker = true) as
select
  absence.id,
  absence.cm_id,
  absence.backup_cm_id as covering_for_cm_id,
  absence.starts_on,
  absence.ends_on,
  absence.starts_on as "from",
  absence.ends_on as "to",
  absence.customer_profile_id,
  absence.compensation_mode,
  absence.note,
  absence.created_at,
  absence.updated_at
from public.cm_absences as absence
where absence.absence_type = 'temporary_coverage';

comment on view public.cm_temporary_coverage is
  'Compatibility view for audit naming. Backed by cm_absences rows where absence_type = temporary_coverage.';
