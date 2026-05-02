# Supabase Production Deploy

Detta repo ar redan lankt mot projektet `fllzlpecwwabwgfbnxfu`.

## Mal

Fa den länkade Supabase-miljon till repo-sanning och lasa in ett deployflode som kan anvanda `supabase db push` framover.

## Engangsrepair for migration history

Den nuvarande remote migration history innehaller flera versioner som inte finns i `supabase/migrations`.
Detta blockerar `supabase db push` tills historiken repareras.

Kor fran repo-roten:

```bash
supabase migration repair --status reverted \
  20260109162156 20260113024842 20260119113017 20260119192035 20260119192353 \
  20260121120433 20260128151526 20260128151552 20260128151617 20260128151702 \
  20260128152853 20260128154600 20260128203019 20260128203041 20260128204440 \
  20260128204500 20260128213843 20260128214245 20260128214354 20260128220125 \
  20260129004111 20260129004604 20260309173802 20260309173814 20260318202448 \
  20260318202458 20260318202512 20260318202529 20260402141722 20260417123252 \
  20260417123304 20260417123310 20260417123321 20260417123332 20260417123350 \
  20260417123400 20260417123410 20260417123429 20260417123442 20260417123453 \
  20260417123502 20260417172929 20260417174145
```

Kontrollera sedan att lokala migrationer nu ar de enda som saknas remote:

```bash
supabase migration list
supabase db push --dry-run
```

Om dry-run ser rimlig ut:

```bash
supabase db push
```

## Edge Functions

Efter databasdeploy ska dessa funktioner vara deployade:

```bash
supabase functions deploy attention-maintenance --no-verify-jwt
supabase functions deploy onboarding-tick --no-verify-jwt
```

`attention-maintenance` och `onboarding-tick` anvander `CRON_SECRET` som egen auth-gate och ska darfor inte krava Supabase JWT.

## GitHub Actions Secrets

Workflown `.github/workflows/supabase-production.yml` forutsatter:

- `SUPABASE_ACCESS_TOKEN`
- `PRODUCTION_PROJECT_ID`
- `PRODUCTION_DB_PASSWORD`

De schemalagda cron-workflowsen forutsatter ocksa:

- `CRON_SECRET`
- `APP_URL` som repository variable

## Viktig Notering

Den nuvarande `supabase/migrations`-kedjan ar nu deploybar mot den länkade produktionen, men repo saknar fortfarande en full greenfield-baseline som kan aterskapa hela public-schemat fran tom databas utan historik. Om ett helt nytt Supabase-projekt ska bootstrapas fran noll bor en riktig baseline-migration tas fram innan det projektet anvands som production source of truth.

## Kvar Manuellt I Supabase Dashboard

- Aktivera leaked password protection i Auth-installningarna.
- `citext` ligger fortfarande i `public` via extension-installationen. Det ar en kvarvarande advisor-varning men inte en blockerare for nuvarande produktion.
