# Bundle 01 Drift Check

Verifierad mot repot `2026-04-22` innan fortsatt implementation av bundle 01.

| Manifestantagande | Status | Notering |
| --- | --- | --- |
| `/admin`, `/admin/customers`, `/admin/customers/[id]`, `/admin/billing`, `/admin/team` finns | Delvis match | Huvudrutterna finns. Dessutom finns grupper som `app/src/app/admin/(ops)` och separata billing-segment under `app/src/app/admin/billing/*`. |
| Kundsubrutter som `contract`, `billing`, `subscription` finns | Match | Faktisk struktur finns under `app/src/app/admin/customers/[id]/*`. |
| Route-segment-modaler ligger som en route per modal | Drift | Faktiska modaler använder parallel/intercepting routes som `@modal/(.)price` och `@modal/(.)[invoiceId]`, inte endast fristående paths enligt manifestexemplen. |
| Hooks `useCustomerDetail`, `useCustomerSubscription`, `useCustomerMutation`, `useAdminRefresh`/`useCustomerBillingRefresh` finns | Match | De första tre finns. `useAdminRefresh` är nu en generisk scope-baserad helper i `useAdminRefresh.ts`, och wrappers som `useCustomerBillingRefresh` bygger ovanpå samma invalidationskarta. |
| `apiClient` finns i `@/lib/admin/api-client` | Match | Exporteras från `app/src/lib/admin/api-client.ts`. |
| Penga- och tidshjälpare finns i `@/lib/admin/money` och `@/lib/admin/time` | Match | `money.ts` har brandade `Ore`/`Sek`-typer och centrala formatteringshelpers. `time.ts` har `shortDateSv`, `longDateSv`, `dateTimeSv` och `relativeSv`. |
| Stripe webhook finns under `/api/stripe/webhook` | Match | Route handler finns i `app/src/app/api/stripe/webhook/route.ts`. |
| `app_role` / `has_role` behöver skapas senare i bundle 01 | Drift | Detta finns redan i tidigare migrationer och typer, så sektion 5 måste behandlas som audit/konsolidering snarare än greenfield. |

## Konsekvens

Fortsatt arbete i bundle 01 körs mot faktisk struktur i repot, inte mot manifestets förenklade exempel. Särskilt gäller detta modalrouting, existerande RBAC/RLS-fundament och redan införd query-key-konvention.
