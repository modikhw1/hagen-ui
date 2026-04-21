### F-2.1 — Pausdatum ligger på kundprofilen i stället för på subscription-spegeln

- **Status:** ❌ saknas
- **Förväntat (källa):** `AGENT-AUDIT-PLAYBOOK.md §2` kräver `subscriptions.pause_until` för F1.6; i `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F1.6 valde admin paus med återupptagningsdatum och automatisk reaktivering.
- **Faktiskt (kod-ref):** `supabase/migrations/20260417010400_customers_patch.sql:3-10` lägger `paused_until` på `customer_profiles`, och `app/src/types/database.ts:2095-2119` visar att `subscriptions` saknar både `pause_until` och annan motsvarande återupptagningskolumn.
- **Påverkan:** Pauslogiken kan inte följas direkt på den faktiska abonnemangsspegeln, vilket försvårar webhook-sync, auto-reaktivering och korrekt billing-state.
- **Förslag (1 mening):** `alter table public.subscriptions add column pause_until date; update public.subscriptions s set pause_until = cp.paused_until from public.customer_profiles cp where cp.stripe_subscription_id = s.stripe_subscription_id and cp.paused_until is not null;`
- **Prioritet (preliminär):** Must
- **Beroenden:** Ingen.

### F-2.2 — Schemalagd prisändring finns inte som strukturerat subscription-fält

- **Status:** ❌ saknas
- **Förväntat (källa):** `AGENT-AUDIT-PLAYBOOK.md §2` kräver `subscriptions.scheduled_price_change` som `jsonb` `{new_price, effective_at}`; `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F1.1 kräver stöd för “byt pris när månaden är slut”.
- **Faktiskt (kod-ref):** `supabase/migrations/20260417000001_backend_schema_rls_stripe_tiktok.sql:51-64` lägger bara scalar-fälten `upcoming_price_change_at` och `upcoming_price_change_value` på `customer_profiles`, medan `app/src/types/database.ts:2095-2119` visar att `subscriptions` saknar ett motsvarande fält helt.
- **Påverkan:** Prisändring vid periodslut är inte modellerad där abonnemangsstatusen faktiskt speglas, vilket gör framtida ändringar svåra att synka, visa och aktivera deterministiskt.
- **Förslag (1 mening):** `alter table public.subscriptions add column scheduled_price_change jsonb; update public.subscriptions s set scheduled_price_change = jsonb_build_object('new_price', cp.upcoming_price_change_value, 'effective_at', cp.upcoming_price_change_at) from public.customer_profiles cp where cp.stripe_subscription_id = s.stripe_subscription_id and cp.upcoming_price_change_value is not null and cp.upcoming_price_change_at is not null;`
- **Prioritet (preliminär):** Must
- **Beroenden:** F-2.1 bör samordnas om paus och schemaläggning ska ligga på samma entitet.

### F-2.3 — CM-historik finns bara som grov `team_customer_history`, inte som `cm_assignments`

- **Status:** ❌ saknas
- **Förväntat (källa):** `AGENT-AUDIT-PLAYBOOK.md §2` kräver `cm_assignments (cm_id, customer_id, valid_from, valid_to)` samt `cm_assignments.scheduled_change`; `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F2.1 kräver pro-rata på dagar, synlig historik och schemalagda byten.
- **Faktiskt (kod-ref):** `app/src/types/database.ts:2323-2365` visar endast `team_customer_history` med `team_member_id`, `customer_profile_id`, `assigned_at` och `unassigned_at`; tabellen saknar `valid_from`, `valid_to`, provisionsmetadata och `scheduled_change`.
- **Påverkan:** Payroll, pro-rata-beräkning, handover-historik och framtida CM-byten saknar en normerad källa att räkna på.
- **Förslag (1 mening):** `create table public.cm_assignments (id uuid primary key default gen_random_uuid(), cm_id uuid not null references public.team_members(id) on delete cascade, customer_id uuid not null references public.customer_profiles(id) on delete cascade, valid_from date not null, valid_to date, scheduled_change jsonb, handover_note text, created_at timestamptz not null default now());`
- **Prioritet (preliminär):** Must
- **Beroenden:** Påverkar §4 Payroll och §6 CM-frånvaro.

### F-2.4 — CM-provisionssats saknas helt i teammodellen

- **Status:** ❌ saknas
- **Förväntat (källa):** `AGENT-AUDIT-PLAYBOOK.md §2` kräver `cms.commission_rate` med default 20% och möjlighet till override; `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F10.4 säger 20% som default och att det ska gå att ställa om per CM.
- **Faktiskt (kod-ref):** `app/src/types/database.ts:2371-2410` visar `team_members` utan `commission_rate`, och `supabase/migrations/20260421130000_team_member_extended_fields.sql:3-9` lägger bara metadatafält som `bio`, `region`, `expertise` och `notes`.
- **Påverkan:** Team-vyn kan inte bära korrekt lönelogik eller CM-specifika overrides utan att hårdkoda 20% i UI eller beräkningar.
- **Förslag (1 mening):** `alter table public.team_members add column commission_rate numeric(5,4) not null default 0.20;`
- **Prioritet (preliminär):** Must
- **Beroenden:** F-2.3 krävs för att commission_rate ska kunna användas korrekt per period.

### F-2.5 — Inställningsdefaults är hårdkodade i kod och saknar `settings`-tabell

- **Status:** ❌ saknas
- **Förväntat (källa):** `AGENT-AUDIT-PLAYBOOK.md §2` kräver `settings.default_billing_interval = month`, `settings.default_payment_terms_days = 14` och `settings.default_currency = SEK`; `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F10.1–F10.3 definierar dessa som operativa defaults.
- **Faktiskt (kod-ref):** `app/src/lib/schemas/customer.ts:6-40` defaultar `subscription_interval` till `'month'`, `app/src/app/api/admin/invoices/create/route.ts:17-18` defaultar `days_until_due` till `14`, och `app/src/app/api/stripe/create-subscription-from-profile/route.ts:107-123` hårdkodar `currency: 'sek'` och `days_until_due: 14`; någon `settings`-tabell finns inte i Supabase-listningen.
- **Påverkan:** Centrala defaults kan inte ändras operativt eller auditeras per miljö, och olika routes riskerar att driva isär.
- **Förslag (1 mening):** `create table public.settings (id boolean primary key default true check (id), default_billing_interval text not null default 'month', default_payment_terms_days integer not null default 14, default_currency text not null default 'SEK', created_at timestamptz not null default now(), updated_at timestamptz not null default now()); insert into public.settings (id) values (true) on conflict (id) do nothing;`
- **Prioritet (preliminär):** Must
- **Beroenden:** Behövs innan en riktig `Settings`-sida i §10 kan byggas.

### F-2.6 — Kundtempo är modellerat som `concepts_per_week` med default 3, inte som förväntat default 2

- **Status:** ⚠️ avvikelse
- **Förväntat (källa):** `AGENT-AUDIT-PLAYBOOK.md §2` kräver `customers.expected_concepts_per_week` med default 2; `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F10.5 säger uttryckligen att default för lazy veckotakt är 2.
- **Faktiskt (kod-ref):** `supabase/migrations/20260417010400_customers_patch.sql:3-16` sätter `concepts_per_week smallint not null default 3`, och både `app/src/app/admin/customers/page.tsx:60-88` och `app/src/components/admin/customers/CustomerDetailView.tsx:305-323` faller tillbaka till `3` i onboarding- och bufferlogik.
- **Påverkan:** Overview, kundkort och bufferstatus räknar på en hårdare takt än admin avsett, vilket kan ge falska röda signaler och fel operativ uppföljning.
- **Förslag (1 mening):** `alter table public.customer_profiles add column expected_concepts_per_week smallint not null default 2 check (expected_concepts_per_week between 1 and 5); update public.customer_profiles set expected_concepts_per_week = coalesce(concepts_per_week, 2);`
- **Prioritet (preliminär):** Should
- **Beroenden:** UI- och derive-logik i overview/kundvyer måste byta datakälla samtidigt.

### F-2.7 — Admin-rollmodellen saknar `super_admin` och `operations_admin`

- **Status:** ❌ saknas
- **Förväntat (källa):** `AGENT-AUDIT-PLAYBOOK.md §2` kräver `admin_roles` enum med minst `super_admin` och `operations_admin`; `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F7.3 valde uttryckligen en tvånivåmodell för admins.
- **Faktiskt (kod-ref):** `supabase/migrations/20260417000001_backend_schema_rls_stripe_tiktok.sql:3-7` definierar endast `app_role` som `('admin', 'content_manager', 'customer')`, och `app/src/types/database.ts:2555-2557` visar ingen separat admin-rollenum.
- **Påverkan:** Alla admins får samma rättigheter i datalagret, vilket blockerar uppdelningen mellan fulla och begränsade admin-befogenheter.
- **Förslag (1 mening):** `create type public.admin_role as enum ('super_admin','operations_admin'); create table public.admin_user_roles (user_id uuid not null references auth.users(id) on delete cascade, role public.admin_role not null, created_at timestamptz not null default now(), primary key (user_id, role));`
- **Prioritet (preliminär):** Must
- **Beroenden:** Behöver kopplas till framtida RLS-hardening och admin-invite-flöden.

### F-2.8 — Audit-logg för destruktiva åtgärder finns inte

- **Status:** ❌ saknas
- **Förväntat (källa):** `AGENT-AUDIT-PLAYBOOK.md §2` kräver `audit_log` för hard delete, CM-arkivering och void invoice; `UI-BRAINSTORM-V2-KATEGORISERAT.md` K08 lyfter audit_log som hörnsten för säkerhet och spårbarhet.
- **Faktiskt (kod-ref):** `app/src/types/database.ts:1580-1600`, `app/src/types/database.ts:2371-2410` och `app/src/types/database.ts:2555-2558` innehåller inga definitioner för `audit_log`, medan destruktiva ytor redan finns i adminflödet.
- **Påverkan:** Destruktiva ändringar kan inte spåras i efterhand, vilket bryter både säkerhetskrav och operativ felsökning.
- **Förslag (1 mening):** `create table public.audit_log (id uuid primary key default gen_random_uuid(), actor_user_id uuid references auth.users(id) on delete set null, action text not null, entity_type text not null, entity_id text not null, before jsonb, after jsonb, created_at timestamptz not null default now());`
- **Prioritet (preliminär):** Must
- **Beroenden:** Behövs före §8 om bekräftelsedialoger ska vara revisionsspårbara.

### F-2.9 — Temporär CM-täckning vid frånvaro saknar egen tabell

- **Status:** ❌ saknas
- **Förväntat (källa):** `AGENT-AUDIT-PLAYBOOK.md §2` kräver `cm_temporary_coverage (cm_id, covering_for_cm_id, from, to)`; `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F4.2–F4.3 beskriver manuell temporär omfördelning av kunder vid sjukdom/semester.
- **Faktiskt (kod-ref):** `app/src/types/database.ts:2323-2365` har bara permanent historik i `team_customer_history`, och varken typerna eller migrationssökningen innehåller någon `cm_temporary_coverage`-modell.
- **Påverkan:** Frånvaro kan inte modelleras separat från permanenta CM-byten, vilket försvårar korrekt provision, ansvar och återgång efter täckningsperiod.
- **Förslag (1 mening):** `create table public.cm_temporary_coverage (id uuid primary key default gen_random_uuid(), cm_id uuid not null references public.team_members(id) on delete cascade, covering_for_cm_id uuid not null references public.team_members(id) on delete cascade, starts_on date not null, ends_on date not null, created_at timestamptz not null default now(), check (starts_on <= ends_on));`
- **Prioritet (preliminär):** Should
- **Beroenden:** Samspelar med F-2.3 om ersättning ska räknas per dag.

### F-2.10 — Det finns specialtabeller för notiser men ingen generell `events`-ström

- **Status:** ⚠️ avvikelse
- **Förväntat (källa):** `AGENT-AUDIT-PLAYBOOK.md §2` kräver `notifications`/`events`-tabell för “vad du missat sedan senaste login”; `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F6.2 vill kunna se händelser sedan senaste inloggning.
- **Faktiskt (kod-ref):** `app/src/types/database.ts:250-390` visar endast specialiserade tabeller som `cm_notifications` och `attention_snoozes`; det finns ingen generell `events`- eller `notifications`-tabell som kan bära tvärgående systemhändelser.
- **Påverkan:** Overview kan visa en del akuta signaler, men systemet saknar en sammanhållen händelseström för att svara på “vad hände medan jag var borta?”.
- **Förslag (1 mening):** `create table public.events (id uuid primary key default gen_random_uuid(), type text not null, severity text not null default 'info', entity_type text, entity_id text, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), read_at timestamptz);`
- **Prioritet (preliminär):** Should
- **Beroenden:** Kan senare mata `NotificationBell`, overview-prioritering och auditvyer.
