# Admin Client Boundary

Inventering av nuvarande `'use client'` inom `app/src/app/admin/**` och `app/src/components/admin/**`.

## Sammanfattning

- De flesta client boundaries i admin behövs för någon av fyra orsaker: URL-state, React Query, dialog/stateful formulär, eller hover/animation.
- De största kandidaterna för RSC-flytt är själva route-entrys (`/admin`, `/admin/team`, `/admin/notifications`) och läsdelarna i kunddetaljvyn där header, KPI-fält och tabskal kan renderas server-side.
- Ett fåtal rena presentational components är client utan tydligt behov och bör granskas när respektive flow ändå öppnas.

| Fil / område | Varför client idag | Vad som kan flyttas till RSC |
| --- | --- | --- |
| `app/src/app/admin/layout.tsx` | Läser auth-context, redirectar i `useEffect` och skapar `QueryClientProvider` i klienten. | Sessionkontroll och admin-guard bör flyttas till server-layout; endast React Query-provider och interaktiv navdel kan vara client. |
| `app/src/app/admin/page.tsx` | Läser `useSearchParams()` och använder `useOverviewData()` via React Query. | Själva overview-data och sortdefault kan laddas i RSC. Endast sort-toggle eller live-refresh behöver client. |
| `app/src/app/admin/team/page.tsx` | Bygger sidan runt klienthooks/modaler. | Server-renderad shell + initial teamdata kan flyttas till RSC, med modaler/listactions kvar i client. |
| `app/src/app/admin/notifications/page.tsx` | Klientstyrd filter/state. | Initial lista och empty/error states kan göras server-side om sidan senare får egen loader. |
| `app/src/app/admin/error.tsx` | Next.js error boundary kräver client. | Ingen naturlig RSC-flytt. |
| `app/src/components/admin/AdminLayout.tsx` | Sidebar-toggle, logout-action och klientnavigering. | Statisk layoutkrom och menydata kan bli serverdelad; interaktivt skal kan vara ett litet client island. |
| `app/src/components/admin/AdminAvatar.tsx` | Hover/fallback-avatar. | Kan bli server om den inte behöver klientevent. |
| `app/src/components/admin/NotificationBell.tsx` | Polling/notifieringar och UI-state. | Endast badge-count kan förhydreras från server; resten behöver client. |
| `app/src/components/admin/OpsSubnav.tsx` | Aktiv route-state i klienten. | Länksamling kan vara server-renderad om active state hämtas från segment/pathname på server. |
| `app/src/components/admin/AttentionList.tsx` | Mutationer, snooze/refresh och lokalt UI-state. | Listdata och första rendern kan serverförberedas; actions stannar i client. |
| `app/src/components/admin/overview/CmPulseSection.tsx` + `CmPulseRow.tsx` + `CmPulseHover.tsx` | Hoverkort och sorterat interaktivt innehåll. | Baslistan kan renderas på server; hovercard/expanded state kvar i client. |
| `app/src/components/admin/customers/CustomersPageClient.tsx` | Search/filter/sort via router replace och invite-modalstate. | Initial data är redan serverladdad; toolbar kan delas upp så tabell/lista blir RSC och filter/CTA blir client. |
| `app/src/components/admin/customers/InviteCustomerModal.tsx` | Form state, previewmutationer och clipboard. | Ingen direkt RSC-flytt; kan senare använda server actions för submit. |
| `app/src/components/admin/customers/modals/*` | Dialoger med formulär, preview och mutationer. | Läsdata kan flyttas till route-segment/RSC; formulärinteraktion kvar i client. |
| `app/src/components/admin/customers/routes/CustomerDetailShell.tsx` | Hela kunddetaljen hydreras via klienthook. | Header/kundmeta och tabskal är starka kandidater för RSC enligt PR-01-06. |
| `app/src/components/admin/customers/routes/CustomerOverviewRoute.tsx` | Bygger overview från klienthämtad kunddata. | Ren läsdel kan renderas server-side med kunddetalj som prop. |
| `app/src/components/admin/customers/routes/CustomerBillingRoute.tsx` | Invoice-lista, modalöppning och refresh-hjälpare. | Fakturalistan kan pre-renderas i RSC; modal och actions i client. |
| `app/src/components/admin/customers/routes/CustomerSubscriptionRoute.tsx` | Subscription hook, mutationer och modalnavigering. | Sammanfattningsrader och statiska badges kan serverrenderas; actions och price-modal kvar i client. |
| `app/src/components/admin/customers/routes/CustomerContractRoute.tsx` | Editform, refresh och kundhook. | Ren kontraktsöversikt kan vara server; edit-former stannar i client. |
| `app/src/components/admin/customers/routes/CustomerActivityRoute.tsx` | Tidslinje och relativ tid i klient. | Läsning kan bli RSC om tidsformat flyttas till shared util/server. |
| `app/src/components/admin/customers/routes/CustomerChangeCMRoute.tsx` + `CustomerInvoiceModalRoute.tsx` + `CustomerSubscriptionPriceRoute.tsx` | Modal shells runt klientdialoger. | Route-segmentet kan vara server, men själva dialogkroppen behöver client. |
| `app/src/components/admin/customers/sections/*` | Delvis hookdrivna widgets och refresh-actions. | TikTok/operational read-model kan flyttas till server om kunddata passas ned från RSC-shell. |
| `app/src/components/admin/billing/BillingShell.tsx` | Segmentnav och env-switching i klienten. | Layoutram + initial filterstate kan bli server; env-switch kan vara ett litet client island. |
| `app/src/components/admin/billing/health/HealthRoute.tsx` | React Query och retry-actions. | Read-only hälsosammanfattning kan pre-renderas; retry/log-panel stannar i client. |
| `app/src/components/admin/billing/invoices/InvoicesRoute.tsx` | Filter, modalstate och refresh. | Server-renderad första sida möjlig; operationsmodal kvar i client. |
| `app/src/components/admin/billing/subscriptions/SubscriptionsRoute.tsx` | Filter, mutationer och refresh. | Sammanfattning/lista kan hämtas på server, actions kvar i client. |
| `app/src/components/admin/billing/InvoiceOperationsModal.tsx` + `SubscriptionPriceChangeModal.tsx` | Dialoger med preview- och mutationslogik. | Ingen tydlig RSC-flytt utöver att preview/resultat kan levereras från route-segment. |
| `app/src/components/admin/team/AddCMDialog.tsx` + `CMEditDialog.tsx` + `CMAbsenceModal.tsx` | Form state, fetch/mutation och confirmations. | Ingen direkt RSC-flytt; candidates först när server actions införs. |
| `app/src/components/admin/team/TeamMemberCard.tsx` | Kortinteraktioner och modalöppning. | Själva kortmarkupen kan vara server om actions lyfts ut. |
| `app/src/components/admin/payroll/*` | Filterperioder, expanders och levande sammanställning. | Server-renderad totalsammanfattning är möjlig; drilldown och actions kvar i client. |
| `app/src/components/admin/audit/*` | Filterstate, pagination och export. | Read-only audit-tabell kan delvis serverrenderas men filtrering talar för client tills route-state formaliseras. |
| `app/src/components/admin/demos/*` | Board-dragning, dialoger och mutationsflöden. | Read-only kolumnsammanfattningar kan bli server; boardinteraktion och dialogs måste vara client. |
| `app/src/components/admin/shared/AdminFormDialog.tsx` | Dialog wrapper kräver open/close-state i klient. | Ingen naturlig RSC-flytt. |
| `app/src/components/admin/_shared/AdminTable.tsx` | Sortering, hover och eventhantering. | Kan bli server om det bara blir presentational table utan klientevents. |

## Nästa steg

1. PR-01-06 bör börja i `app/src/app/admin/customers/[id]/page.tsx` och flytta kundheadern till server.
2. Efter det bör `app/src/app/admin/layout.tsx` delas upp i server guard + tunn client provider.
3. Sidor som redan får serverdata (`/admin/customers`) bör undvika att åter-hydrera hela läsgränssnittet i onödan.
