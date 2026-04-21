### F-3.1 — Mid-cycle prisändring saknar rad-split på samma faktura

- **Status:** ❌ saknas
- **Förväntat (källa):** `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F1.1 — "automatiskt skapa två rader" där perioden delas upp i två prisrader för olika datumintervall.
- **Faktiskt (kod-ref):** `app/src/components/admin/billing/tabs/SubscriptionsTab.tsx:96-139` — abonnemangsfliken visar bara nuvarande pris, nästa period och status; det finns inget UI för att skapa eller förhandsvisa två prorata-rader på samma faktura.
- **Påverkan:** Admin kan inte genomföra den prisändringsmodell som är definierad för upp- och nedgraderingar mitt i perioden.
- **Förslag (1 mening):** Lägg till en prisändringsmodal som hämtar `invoices.upcoming` och visar två fakturarader för delperioderna innan ändringen sparas.
- **Prioritet (preliminär):** Must
- **Beroenden:** F-2.2

### F-3.2 — Ingen toggle för “byt pris nu” kontra “vid nästa period”

- **Status:** ❌ saknas
- **Förväntat (källa):** `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F1.1 — "det borde också finnas möjlighet att säga 'byt pris när månaden är slut'".
- **Faktiskt (kod-ref):** `app/src/components/admin/billing/tabs/SubscriptionsTab.tsx:31-58` — abonnemangsfliken laddar och synkar listor men har inget val för `proration_behavior`, `effective_at` eller schemalagd prisändring.
- **Påverkan:** Admin kan inte välja mellan omedelbar ändring och ändring vid periodskifte utan manuell hantering utanför UI:t.
- **Förslag (1 mening):** Lägg till ett explicit val mellan omedelbar prisändring och schemalagd prisändring vid nästa periodstart.
- **Prioritet (preliminär):** Must
- **Beroenden:** F-2.2

### F-3.3 — Kreditnota-flöde för enskild fakturarad saknas helt

- **Status:** ❌ saknas
- **Förväntat (källa):** `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F1.2 — faktura ska kunna "krediteras med en rad"; `UI-BRAINSTORM-V3-FLOWS-OCH-OPERATIV-LOGIK.md` S-01 kräver `CreditNoteModal` med val per rad.
- **Faktiskt (kod-ref):** `app/src/components/admin/billing/BillingHub.tsx:69-95` — Billing har bara flikarna Fakturor, Abonnemang och Sync & Health; ingen fakturadetalj eller kreditnota-modal finns tillgänglig från billingflödet.
- **Påverkan:** Felaktiga eller delvis felaktiga fakturor kan inte korrigeras på radnivå i admin utan extern Stripe-hantering.
- **Förslag (1 mening):** Lägg till fakturadetalj med `CreditNoteModal` som stöder radval och delkreditering.
- **Prioritet (preliminär):** Must
- **Beroenden:** F-2.4, F-2.8

### F-3.4 — Kreditera och skapa ny korrekt faktura direkt stöds inte

- **Status:** ❌ saknas
- **Förväntat (källa):** `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F1.2 — admin ska kunna välja att kreditera och sedan skicka ut en ny korrekt faktura direkt.
- **Faktiskt (kod-ref):** `app/src/components/admin/customers/modals/ManualInvoiceModal.tsx:49-63` — modalens enda flöde är att skapa en separat manuell faktura med positiva rader; den kopplar inte till befintlig faktura eller kreditflöde.
- **Påverkan:** Korrigeringar av felaktiga fakturor blir två manuella steg utanför det avsedda operativa flödet och riskerar att lämna spegeldata inkonsistent.
- **Förslag (1 mening):** Lägg till ett sammanhållet kreditflöde som efter kredit kan skapa en korrigerad ersättningsfaktura från samma underlag.
- **Prioritet (preliminär):** Should
- **Beroenden:** F-3.3, F-2.4, F-2.8

### F-3.5 — `partially_refunded` exponeras inte som egen badge eller filter

- **Status:** ⚠️ avvikelse
- **Förväntat (källa):** `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F1.3 — faktura som delvis återbetalats ska visas som egen status enligt svar B; listvyn måste gå att filtrera på detta.
- **Faktiskt (kod-ref):** `app/src/components/admin/billing/tabs/InvoicesTab.tsx:60-135` — fakturalistan visar endast allmän statusbadge via `invoiceStatusConfig` och saknar filterkontroller för refund/kreditrelaterade delstatusar.
- **Påverkan:** Admin kan inte snabbt hitta delvis återbetalda fakturor eller skilja dem från vanliga `paid`-/`open`-poster.
- **Förslag (1 mening):** Lägg till en dedikerad `partially_refunded`-presentation med egen badge-färg och filter i fakturalistan.
- **Prioritet (preliminär):** Should
- **Beroenden:** F-2.4, F-3.11

### F-3.6 — Rabattmodal använder fel begrepp och fel default-duration

- **Status:** ⚠️ avvikelse
- **Förväntat (källa):** `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F1.5 — "Prissänkning eller erbjudande passar bättre" och default ska i praktiken vara 1 månad.
- **Faktiskt (kod-ref):** `app/src/components/admin/customers/modals/DiscountModal.tsx:27-45` och `app/src/components/admin/customers/modals/DiscountModal.tsx:88-176` — modalen heter "Lägg till rabatt", sparar "Spara rabatt" och initierar `durationMonths` till `3`.
- **Påverkan:** UI-språket och defaults styr admins till ett längre och mindre önskat erbjudandeflöde än verksamheten beskriver.
- **Förslag (1 mening):** Byt språk till prissänkning/erbjudande och sätt standardduration till 1 månad.
- **Prioritet (preliminär):** Should
- **Beroenden:** Inga

### F-3.7 — Pausflödet saknar `pause_until` och auto-reaktivering

- **Status:** ❌ saknas
- **Förväntat (källa):** `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F1.6 — paus ska ha "återupptas YYYY-MM-DD"-indikator och automatisk reaktivering; `UI-BRAINSTORM-V3-FLOWS-OCH-OPERATIV-LOGIK.md` S-04 beskriver datumstyrd paus.
- **Faktiskt (kod-ref):** `app/src/components/admin/customers/SubscriptionActions.tsx:64-101` — admin kan bara trycka på "Pausa abonnemang" eller "Återuppta abonnemang" utan datumval, pause-metadata eller planerad återstart.
- **Påverkan:** Säsongspauser måste bevakas manuellt och det saknas ett pålitligt slutdatum för kund- och CM-planering.
- **Förslag (1 mening):** Inför en pausmodal med slutdatum, lagring av `pause_until` och ett auto-resume-flöde när datumet passeras.
- **Prioritet (preliminär):** Must
- **Beroenden:** F-2.1

### F-3.8 — Uppsägning saknar de tre operativa valen som admin vill ha

- **Status:** ❌ saknas
- **Förväntat (källa):** `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F3.1 — stöd behövs för både `cancel_at_period_end`, omedelbart avslut utan refund och omedelbart avslut med kreditering.
- **Faktiskt (kod-ref):** `app/src/components/admin/customers/SubscriptionActions.tsx:89-101` — UI:t erbjuder bara ett enda "Avsluta abonnemang"-kommando utan modal för val av uppsägningssätt eller kreditutfall.
- **Påverkan:** Admin kan inte utföra uppsägning enligt kundärendets behov utan att gå utanför produkten eller tolka backend-beteendet i blindo.
- **Förslag (1 mening):** Lägg till en uppsägningsmodal med tre explicita val och tydlig konsekvensbeskrivning innan bekräftelse.
- **Prioritet (preliminär):** Must
- **Beroenden:** F-3.3, F-3.8

### F-3.9 — Health-tab visar webhook-fel men saknar retry-åtgärd

- **Status:** ⚠️ avvikelse
- **Förväntat (källa):** `AGENT-AUDIT-PLAYBOOK.md` §3 — webhook-failures ska vara synliga i Health-tab med retry-knapp.
- **Faktiskt (kod-ref):** `app/src/components/admin/billing/tabs/HealthTab.tsx:152-193` — senaste fel visas i en sidopanel men det finns ingen knapp eller action för att trigga om behandling av misslyckade event.
- **Påverkan:** Operatören kan se att synken fallerat men kan inte återköra det blockerade flödet från samma vy.
- **Förslag (1 mening):** Lägg till retry-action per failed event eller en säker batch-retry för de senaste misslyckade webhookarna.
- **Prioritet (preliminär):** Should
- **Beroenden:** F-2.10

### F-3.10 — Refund- och kreditnota-events saknas i webhookkedjan

- **Status:** ❌ saknas
- **Förväntat (källa):** `AGENT-AUDIT-PLAYBOOK.md` §3 — endpoint och handler ska verifiera `charge.refunded` och `credit_note.created`; `UI-BRAINSTORM-V3-FLOWS-OCH-OPERATIV-LOGIK.md` S-01 anger webhook `credit_note.created`.
- **Faktiskt (kod-ref):** `app/src/app/api/stripe/webhook/route.ts:82-129` — webhook-routen hanterar invoice- och subscription-events men saknar cases för `charge.refunded` och `credit_note.created`; Stripe test-endpointen är samtidigt konfigurerad utan dessa events.
- **Påverkan:** Refunds och kreditnotor kan inte speglas till adminvyn på ett säkert sätt, vilket bryter uppföljning av korrigeringar och delåterbetalningar.
- **Förslag (1 mening):** Registrera båda eventtyperna på webhook-endpointen och lägg till handlers som uppdaterar refund-/credit-note-spegeln.
- **Prioritet (preliminär):** Must
- **Beroenden:** F-2.8, F-2.10
