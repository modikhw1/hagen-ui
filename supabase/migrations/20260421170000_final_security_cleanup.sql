begin;

drop policy if exists "Allow insert leads from anon" on public.leads;
drop policy if exists "Allow select leads for service" on public.leads;

do $$
declare
  fn record;
begin
  for fn in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not exists (
        select 1
        from pg_depend d
        join pg_extension e
          on e.oid = d.refobjid
        where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid
          and d.deptype = 'e'
      )
      and (
        p.proconfig is null
        or not exists (
          select 1
          from unnest(p.proconfig) as cfg
          where cfg like 'search_path=%'
        )
      )
  loop
    execute format(
      'alter function %I.%I(%s) set search_path = public',
      fn.schema_name,
      fn.function_name,
      fn.identity_args
    );
  end loop;
end $$;

commit;
