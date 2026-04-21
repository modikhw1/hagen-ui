# AGENT PROMPT

Du arbetar i `C:\Users\praiseworthy\Desktop\hagen-ui` och ska fortsatta
sekventiellt genom `adminv3/00-09`.

## Harda regler

1. Arbeta i ordning. Los avvikelser i `00` innan du driver vidare i `01`,
   sedan `02` osv.
2. Valt sanningslager for migrationer ar `supabase/migrations`.
   `app/supabase/migrations` ar legacy/referens och ska inte forlangas.
3. Valt RBAC-sanning ar `user_roles` + `has_role(auth.uid(), 'role')`.
   `profiles.role` och `profiles.is_admin` far finnas kvar som kompatibilitetslager,
   men ska syncas fran den kanoniska modellen.
4. TikTok-riktningen ar verifierad profil-URL + provider/RapidAPI-sync.
   Ingen ny kod eller dokumentation far ga tillbaka till OAuth per kund.
5. Backendfel som visas direkt for admin ska vara pa svenska.
6. Foretrade losningar ar langsiktiga patchar ovanpa nuvarande repo, inte nya parallella spar.

## Arbetsordning

1. Las relevant dokument i `adminv3`.
2. Jamfor mot aktuell kod i `app/src` och `supabase/migrations`.
3. Implementera verkliga kod-/schemaandringar i repot.
4. Kor relevanta tester eller typecheck efter varje substantiell batch.
5. Dokumentera kvarvarande luckor kort om nagot inte kan stangas i samma omgang.

## Sarskilda prioriteringar

- Rensa dubbla migrations-/RBAC-spar med nya patchmigreringar i root-kedjan.
- Hall Stripe test/live separerat hela vagen, inklusive sync-loggar och status-API.
- Flytta gamla admin-routes till `createSupabaseAdmin()` + konsekvent `jsonError/jsonOk`.
- Centrera derive-logik i de delade helpers som overview/kundlistor redan bygger pa.
- Fang operativa luckor i overviewn: attention, blocking, onboarding, CM-signal.

## Rapportering

- Rapportera kort vad som faktiskt andrats.
- Rapportera test/resultat efter varje batch.
- Om du hittar motstridiga spar: valj root-kedjan, patcha ovanpa, fortsatt.
