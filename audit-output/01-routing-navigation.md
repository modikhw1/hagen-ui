### F-1.1 — Saknade admin-routes för operativa sidor

- **Status:** ❌ saknas
- **Förväntat (källa):** `AGENT-AUDIT-PLAYBOOK.md §1` kräver routes för `Notifications`, `Payroll`, `Settings` och `AuditLog`; `UI-BRAINSTORM-V3-FLOWS-OCH-OPERATIV-LOGIK.md` Del 6 listar `NotificationBell`, `PayrollPage` och `ActivityLog` som saknade UI-ytor som ska finnas i admin-flödet, och admins svar i `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F10.1–F10.5 kräver hantering av defaults som hör hemma i `Settings`.
- **Faktiskt (kod-ref):** `app/src/components/admin/AdminLayout.tsx:14-23` — sidnavigeringen exponerar bara `/admin`, `/admin/customers`, `/admin/billing` och `/admin/team`, och det finns inga motsvarande routes under `app/src/app/admin/` för `Notifications`, `Payroll`, `Settings` eller `AuditLog`.
- **Påverkan:** Admin saknar fasta destinationssidor för notifikationer, löneunderlag, inställningar och revisionsspår, vilket blockerar flera operativa flöden som playbooken förutsätter.
- **Förslag (1 mening):** Lägg till route-shells för `notifications`, `payroll`, `settings` och `audit-log` under `app/src/app/admin/` och koppla dem i adminnavigeringen.
- **Prioritet (preliminär):** Must
- **Beroenden:** Inga.

### F-1.2 — Kundlistans sök/filter-state är inte navigerbar eller persistent

- **Status:** ⚠️ avvikelse
- **Förväntat (källa):** `AGENT-AUDIT-PLAYBOOK.md §1` anger att `Customers` ska bevara filter/sökning/sidnummer när man går in i en kund och tillbaka; `UI-BRAINSTORM-V3-FLOWS-OCH-OPERATIV-LOGIK.md` Del 1.2 lyfter uttryckligen `URL-state?` för filter-pills och pagination.
- **Faktiskt (kod-ref):** `app/src/app/admin/customers/page.tsx:28-31` och `app/src/app/admin/customers/page.tsx:163-195` — `search`, `filter` och sortering ligger endast i lokal `useState`, och `app/src/app/admin/customers/page.tsx:221` navigerar till detaljvyn utan att serialisera list-state i URL eller annan persistent lagring.
- **Påverkan:** Admin riskerar att tappa arbetskontext när kundlistan öppnas från detaljvy, vilket förlänger triage av kunder och gör listan svårare att använda som operativ arbetsyta.
- **Förslag (1 mening):** Flytta sök/filter/sortering/pagination till query params och hydrera listan från URL så att state överlever navigation och delbara länkar.
- **Prioritet (preliminär):** Should
- **Beroenden:** Ingen, men lösningen bör återanvändas av tillbaka-flödet i F-1.3.

### F-1.3 — Tillbaka-knappen återställer inte scroll eller listkontext explicit

- **Status:** ❌ saknas
- **Förväntat (källa):** `AGENT-AUDIT-PLAYBOOK.md §1` kräver ett tillbaka-beteende som återställer scroll och filter-state, inte bara `navigate(-1)`; admins svar i `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F6.2 beskriver ett arbetssätt där admin snabbt ska kunna hoppa mellan översikt och åtgärdspunkter utan att tappa läge.
- **Faktiskt (kod-ref):** `app/src/components/admin/customers/CustomerDetailView.tsx:458-465` — tillbaka-knappen gör endast `router.back()` eller fallback `router.push('/admin/customers')`, utan sparad scrollposition, listankare eller återställning av tidigare filter-state.
- **Påverkan:** Återgång från kunddetalj kan landa i fel läge eller högst upp i listan, vilket bryter snabb navigation mellan flera kunder i samma arbetsomgång.
- **Förslag (1 mening):** Spara föregående kundlistas URL och scrollposition före navigation till detaljvyn och återställ dem explicit när användaren går tillbaka.
- **Prioritet (preliminär):** Should
- **Beroenden:** F-1.2 eller motsvarande gemensam URL-state-lösning.

### F-1.4 — Admin-routes saknar tydliga sidtitlar per vy

- **Status:** ⚠️ avvikelse
- **Förväntat (källa):** `AGENT-AUDIT-PLAYBOOK.md §1` kräver tydlig `<title>` per route utöver aktiv state i sidebar; `UI-BRAINSTORM-V3-FLOWS-OCH-OPERATIV-LOGIK.md` Del 1 definierar flera separata admin-vyer som behöver vara särskiljbara när admin arbetar parallellt.
- **Faktiskt (kod-ref):** `app/src/app/layout.tsx:14-21` — endast en global metadata-title `LeTrend` sätts i root-layouten, och det finns inga route-specifika `metadata` eller `generateMetadata` under `app/src/app/admin/**`; aktiv sidebar-state finns däremot i `app/src/components/admin/AdminLayout.tsx:39-50`.
- **Påverkan:** Webbläsarflikar, historik och bokmärken blir otydliga när flera adminvyer är öppna samtidigt, vilket försämrar snabb operativ växling mellan sidor.
- **Förslag (1 mening):** Lägg till route-specifik `metadata.title` eller `generateMetadata` för varje admin-sida och behåll nuvarande sidebar-markering.
- **Prioritet (preliminär):** Nice
- **Beroenden:** Inga.
