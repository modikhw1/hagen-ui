# Setup Admin Access

Den har guiden galler den nuvarande repo-modellen.

Kanonisk migrationskedja:

- `supabase/migrations`

Legacy/referens:

- `app/supabase/migrations`

Applicera inte gamla migrationer under `app/supabase/migrations` i nya eller uppdaterade miljoer.

## 1. Applicera kanoniska migrationer

Kor fran repo-roten:

```bash
npx supabase db push
```

Om den lankade remote-historiken blockerar `db push`, folj instruktionerna i [supabase/PRODUCTION_DEPLOY.md](/C:/Users/praiseworthy/Desktop/hagen-ui/supabase/PRODUCTION_DEPLOY.md).

## 2. Kontrollera att anvandaren finns

Om anvandaren inte redan finns i Auth:

1. Skapa eller bjud in anvandaren via appen eller Supabase Auth.
2. Bekrafta email om projektet kraver det.

## 3. Ge admin-roll via `user_roles`

Repo-sanningen for RBAC ar `public.user_roles` + `public.has_role(...)`.
`profiles.role` och `profiles.is_admin` ar kompatibilitetsfalt, inte primar sann kalla.

Kor i Supabase SQL Editor:

```sql
insert into public.user_roles (user_id, role)
select p.id, 'admin'::public.app_role
from public.profiles p
where p.email in ('din-email@example.com', 'dev@letrend.se')
on conflict (user_id, role) do nothing;
```

## 4. Verifiera rollen

```sql
select
  p.email,
  public.has_role(p.id, 'admin'::public.app_role) as is_admin,
  array_agg(ur.role order by ur.role) filter (where ur.role is not null) as roles
from public.profiles p
left join public.user_roles ur on ur.user_id = p.id
where p.email in ('din-email@example.com', 'dev@letrend.se')
group by p.id, p.email
order by p.email;
```

Forvanta `is_admin = true` for den anvandare som ska ha adminaccess.

## 5. Logga ut och in igen

Efter att rollen ar satt:

1. Logga ut ur appen.
2. Logga in igen.
3. Testa `/admin`.

## Vanliga fel

`error=admin_required` eller redirect bort fran `/admin`

- Kontrollera att raden i `public.user_roles` finns.
- Kontrollera att `public.has_role(...)` returnerar `true`.
- Logga ut och in igen sa att sessionen laddas om.

`column "environment" does not exist` i admin-billingvyer

- Root-migrationerna ar inte fullt applicerade. Kor `npx supabase db push` fran repo-roten.

`supabase db push` blockerad av gammal migration history

- Folj repair-stegen i [supabase/PRODUCTION_DEPLOY.md](/C:/Users/praiseworthy/Desktop/hagen-ui/supabase/PRODUCTION_DEPLOY.md).

## Kort sammanfattning

- Schema sanning: `supabase/migrations`
- RBAC sanning: `public.user_roles`
- Policy-checks: `public.has_role(auth.uid(), 'admin'::public.app_role)`
