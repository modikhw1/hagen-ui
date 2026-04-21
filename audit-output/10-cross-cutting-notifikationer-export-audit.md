### F-10.1 - `NotificationBell` saknas i admin-layouten

- **Status:** ❌ saknas
- **Forvantat (kalla):** `UI-BRAINSTORM-V3-FLOWS-OCH-OPERATIV-LOGIK.md:512` - `NotificationBell` i topbar ska visa olasta `admin_alerts`.
- **Faktiskt (kod-ref):** `app/src/components/admin/AdminLayout.tsx:14-108` bestar av sidebar och huvudyta med logout-knapp, men ingen topbar eller notifikationsikon renderas.
- **Paverkan:** Admin saknar ett globalt satt att se olasta handelser utanfor overview-sidan.
- **Forslag (1 mening):** Lagg till en header/topbar med `NotificationBell` kopplad till olasta admin-alerts.
- **Prioritet (preliminar):** Should
- **Beroenden:** F-2.10

### F-10.2 - Export/CSV fran kundlistan saknas

- **Status:** ❌ saknas
- **Forvantat (kalla):** `AGENT-AUDIT-PLAYBOOK.md` §10 - `Customers` ska ha export-knapp for CSV med MRR per kund for bokforing.
- **Faktiskt (kod-ref):** `app/src/app/admin/customers/page.tsx:159-194` innehaller bara invite, sok, filter och sortering; ingen exportknapp eller nedladdningsaction finns. `app/src/app/api/admin/customers/route.ts:18-53` returnerar dessutom bara JSON-listpayload och exponerar ingen CSV/export-endpoint.
- **Paverkan:** Bokforings- och uppfoljningsdata maste extraheras manuellt eller byggas utanfor appen.
- **Forslag (1 mening):** Lagg till en exportaction som genererar CSV fran den filtrerade kundlistan med MRR och relevanta statusfalt.
- **Prioritet (preliminar):** Should
- **Beroenden:** Inga

### F-10.3 - `AuditLog`-sida eller panel saknas

- **Status:** ❌ saknas
- **Forvantat (kalla):** `AGENT-AUDIT-PLAYBOOK.md` §10 - `AuditLog` ska finnas som sida eller panel; samma playbook namner ocksa route for `AuditLog`.
- **Faktiskt (kod-ref):** `app/src/components/admin/AdminLayout.tsx:14-24` innehaller bara `Oversikt`, `Kunder`, `Billing` och `Team`; ingen auditlog-yta exponeras i navigationen.
- **Paverkan:** Administrativa och destruktiva handelser kan inte granskas i UI trots att de har operativ och juridisk betydelse.
- **Forslag (1 mening):** Lagg till en auditlog-vy som visar historik for administratorsatgarder och koppla den till navigationen.
- **Prioritet (preliminar):** Must
- **Beroenden:** F-2.8

### F-10.4 - `Settings`-sida for operativa defaults saknas

- **Status:** ❌ saknas
- **Forvantat (kalla):** `AGENT-AUDIT-PLAYBOOK.md` §10 - `Settings`-sida ska finnas for defaults enligt F10.1-F10.5.
- **Faktiskt (kod-ref):** `app/src/components/admin/AdminLayout.tsx:14-24` saknar route och entry for settings; inga settings-relaterade adminvyer finns exponerade.
- **Paverkan:** Defaults for billing, valuta och tempo kan inte forvaltas centralt i admin utan ligger utspridda i kod/databas.
- **Forslag (1 mening):** Lagg till en settings-vy som samlar och exponerar de operativa standardvarden som idag ar hardkodade.
- **Prioritet (preliminar):** Must
- **Beroenden:** F-2.5, F-2.6

### F-10.5 - Kunddetaljen saknar `ActivityLog` trots att den finns i malbilden

- **Status:** ❌ saknas
- **Forvantat (kalla):** `UI-BRAINSTORM-V3-FLOWS-OCH-OPERATIV-LOGIK.md:72,513` - CustomerDetail ska ha `Aktivitetslogg`/`ActivityLog` som tab eller panel for komplett historik per kund.
- **Faktiskt (kod-ref):** `app/src/components/admin/customers/CustomerDetailView.tsx:721-1010` bygger kunddetaljen som sektioner for operativ status, CM, kontakt, TikTok och atgarder. Samma vy innehaller onboarding-checklista i `:744-756`, men ingen tab, panel eller komponent for aktivitetslogg och ingen `ActivityLog`-referens finns i adminkoden.
- **Paverkan:** Admin kan agera pa kunden men inte se en sammanhallen historik for invites, CM-byten, game-plan-andringar och andra handelser i samma arbetsyta.
- **Forslag (1 mening):** Lagg till en `ActivityLog`-sektion i kunddetaljen som visar kundspecifika handelser med tid, aktor och action.
- **Prioritet (preliminar):** Should
- **Beroenden:** F-2.8
