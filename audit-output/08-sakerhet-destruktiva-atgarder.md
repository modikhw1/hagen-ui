### F-8.1 — Arkivera CM sker utan bekräftelsemodal

- **Status:** ⚠️ avvikelse
- **Förväntat (källa):** `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F7.1 — bekräftelsemodal ska krävas för "hard delete + arkivera CM + void faktura"; svaret är B.
- **Faktiskt (kod-ref):** `app/src/components/admin/team/CMEditDialog.tsx:270-276` — knappen "Arkivera CM" anropar `handleArchive` direkt utan separat confirm-steg eller typed confirmation.
- **Påverkan:** En feltolkad eller felklickad arkivering kan stänga av en CM och omfördela kunder utan extra kontroll.
- **Förslag (1 mening):** Lägg ett explicit confirm-steg före arkivering av CM, med tydlig konsekvensbeskrivning.
- **Prioritet (preliminär):** Must
- **Beroenden:** F-2.8

### F-8.2 — Void/annullera faktura sker utan bekräftelsemodal

- **Status:** ⚠️ avvikelse
- **Förväntat (källa):** `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F7.1 — void invoice ska ligga bakom bekräftelsemodal.
- **Faktiskt (kod-ref):** `app/src/components/admin/customers/CustomerDetailView.tsx:1320-1337` — fakturadetaljen visar direktknappen "Annullera" som omedelbart skickar `action: 'void'` utan extra bekräftelse.
- **Påverkan:** Ekonomiskt och juridiskt känsliga fakturaåtgärder kan triggas utan ett extra kontrollsteg.
- **Förslag (1 mening):** Lägg till en bekräftelsemodal innan en öppen faktura voidas.
- **Prioritet (preliminär):** Must
- **Beroenden:** F-2.8

### F-8.3 — Kund arkiveras inte automatiskt när abonnemanget faktiskt upphör

- **Status:** ❌ saknas
- **Förväntat (källa):** `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F7.2 — arkivering beskrivs som en möjlig automatisk close efter att abonnemanget är slut.
- **Faktiskt (kod-ref):** `app/src/app/api/stripe/webhook/route.ts:103-114` och `app/src/components/admin/customers/SubscriptionActions.tsx:89-110` — subscription-events speglas, men kundarkivering sker bara via den separata "Arkivera kund"-aktionen.
- **Påverkan:** Avslutade abonnemang kan lämna kunder i ett mellanläge där subscription är slut men kundprofilen fortfarande kräver manuell städning.
- **Förslag (1 mening):** Arkivera kundprofilen automatiskt när abonnemanget definitivt avslutas, eller skapa ett explicit eftersteg som triggas av webhooken.
- **Prioritet (preliminär):** Should
- **Beroenden:** F-2.8

### F-8.4 — Destruktiva och ekonomiska admin-actions skriver inte audit-logg

- **Status:** ❌ saknas
- **Förväntat (källa):** `UI-BRAINSTORM-V3-FLOWS-OCH-OPERATIV-LOGIK.md:135` — varje destruktiv eller ekonomiskt känslig action ska skriva till `audit_log`.
- **Faktiskt (kod-ref):** `app/src/app/api/admin/team/[id]/route.ts:127` inaktiverar CM direkt, `app/src/app/api/admin/customers/[id]/route.ts:651-659` arkiverar kund direkt, och `app/src/lib/stripe/admin-billing.ts:12,63-69,387` loggar bara Stripe-syncmetadata via `logStripeSync`; `rg -n "audit_log"` över dessa kodvägar ger inga träffar.
- **Påverkan:** Det finns ingen sammanhållen revisionskedja för vem som arkiverade, voidade eller ändrade ekonomiska objekt, vilket försvårar ansvar, felsökning och intern kontroll.
- **Förslag (1 mening):** Skriv explicita audit-events för kundarkiv, CM-arkiv, void/pay och andra ekonomiska admin-actions i en separat audit-logg.
- **Prioritet (preliminär):** Must
- **Beroenden:** F-2.8

### F-8.5 — Arkivera kund och avsluta abonnemang sker utan bekräftelsemodal

- **Status:** ⚠️ avvikelse
- **Förväntat (källa):** `UI-BRAINSTORM-V3-FLOWS-OCH-OPERATIV-LOGIK.md:133-134` — destruktiva actions ska gå via bekräftelsedialog med konsekvenstext.
- **Faktiskt (kod-ref):** `app/src/components/admin/customers/SubscriptionActions.tsx:94-105` anropar `run('cancel_subscription')` och `run('archive', 'DELETE')` direkt från knapparna, medan `app/src/app/api/admin/customers/[id]/route.ts:651-659` vid arkivering först kör `archiveStripeCustomer(...)` och sedan sätter kunden till `archived`.
- **Påverkan:** Ett felklick kan direkt starta uppsägning eller arkivering med Stripe-side effects utan ett extra kontrollsteg.
- **Förslag (1 mening):** Lägg en confirm-modal med konsekvenstext framför uppsägning och kundarkivering, särskilt när Stripe-prenumerationen påverkas.
- **Prioritet (preliminär):** Must
- **Beroenden:** F-2.8

### F-8.6 — Privilegierade admin-actions kan inte skiljas mellan super-admin och operations-admin

- **Status:** ❌ saknas
- **Förväntat (källa):** `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F7.3 — rollen bör delas i minst `super-admin` och `operations-admin`, där den senare inte ska kunna radera eller refunda fritt.
- **Faktiskt (kod-ref):** `app/src/lib/auth/roles.ts:7`, `app/src/lib/auth/api-auth.ts:61` och `app/src/types/database.ts:2556-2557` visar bara rollerna `admin|content_manager|customer|user`, och destruktiva admin-endpoints skyddas generellt bara med `['admin']` som i `app/src/app/api/admin/team/[id]/route.ts:12,53,113`.
- **Påverkan:** Alla admins får samma behörighet till arkivering, voiding och andra känsliga ingrepp, vilket gör principen om minsta privilegium omöjlig.
- **Förslag (1 mening):** Inför separata admin-roller i RBAC och lägg explicit högre spärr på destruktiva och ekonomiska endpoints.
- **Prioritet (preliminär):** Should
- **Beroenden:** F-2.7
