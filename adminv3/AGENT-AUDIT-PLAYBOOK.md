# LeTrend Admin — Agent Audit Playbook

**Syfte:** Strikt körbar genomgång av repot för en AI-agent som inte är lika smart som planeringsassistenten. Agenten ska INTE tänka fritt — den ska följa checklistor, samla fynd i ett standardformat, och **inte föreslå ändringar utanför det aktuella segmentet**.

**Förutsättning för agenten:**
- Läs dessa dokument i ordning innan du börjar:
  1. `OPERATIV-FLODESBEDOMNING-IFYLLD.md` (admins svar — auktoritativ källa för "förväntat beteende")
  2. `UI-BRAINSTORM-V2-KATEGORISERAT.md` (tekniska scenarios)
  3. `UI-BRAINSTORM-V3-FLOWS-OCH-OPERATIV-LOGIK.md` (UI-flöden, S-01–S-13)
  4. `07-operativ-modell-och-koncept.md` (domänspråk)
  5. `01-supabase-schema-rls-triggers.md` + `08-schema-patchar-och-tabeller.md` (datamodell)
- MCP-verktyg som ska användas: **Supabase MCP** (lista tabeller/RLS/functions/triggers), **Stripe MCP** (lista products/prices/webhook endpoints/test events).
- **Förbjudet:** att refaktorera kod, ändra design-tokens, byta bibliotek, lägga till features som inte finns i något av segmenten nedan.
- **Tillåtet:** läsa filer, köra MCP-frågor, skapa nya filer **endast** under `/audit-output/` med fynd i exakt format som anges i §"Fyndformat".

---

## Hur du arbetar (loop per segment)

För **varje** segment §1–§10:

1. **Läs** de filer som listas under "Filer att läsa".
2. **Kör** MCP-frågorna under "MCP-checks" (om sådana finns).
3. **Gå igenom** checklistan rad för rad. Markera ✅ (matchar förväntan), ⚠️ (avviker), ❌ (saknas helt), 🚧 (oklart — behöver mänskligt svar).
4. **Skriv** alla ⚠️/❌/🚧 till `/audit-output/{segment-nr}-{namn}.md` i Fyndformatet.
5. **STOPPA** efter varje segment. Vänta på att människan godkänner innan nästa segment börjar.

**Viktigt:** Om en checkpunkt kräver att du gissar — markera 🚧 och beskriv vad som saknas. Gissa aldrig.

---

## Fyndformat (mall — kopiera per fynd)

```
### F-{segment}.{nr} — {kort titel}

- **Status:** ⚠️ avvikelse | ❌ saknas | 🚧 oklart
- **Förväntat (källa):** {citat eller paragraf-ref från admins svar / brainstorm}
- **Faktiskt (kod-ref):** `path/to/file.tsx:lineRange` — {beskrivning av vad koden gör}
- **Påverkan:** vilket operativt flöde bryter / vilken admin-uppgift blockeras
- **Förslag (1 mening):** {minimal ändring — INTE en feature-utvidgning}
- **Prioritet (preliminär):** Must | Should | Nice | Later (se PRIORITERINGSMATRIS)
- **Beroenden:** {andra fynd eller MCP-resurser som måste på plats först}
```

Skriv inget annat än fynd. Inga reflektioner, inga "jag noterar att…".

---

## §1 — Routing & navigation

**Filer att läsa:** `src/App.tsx`, `src/components/admin/AdminLayout.tsx`, alla filer under `src/pages/admin/`.

**Checklista:**
- [ ] Finns route för **varje** sida som nämns i V2/V3 (Overview, Customers, CustomerDetail, Billing-tabs, Team, samt saknade: Notifications, Payroll, Settings, AuditLog)?
- [ ] Bevaras filter/sökning/sida-nummer i `Customers` när man navigerar in i en kund och tillbaka? (admin nämnde detta som pain point)
- [ ] Finns "tillbaka"-beteende som faktiskt återställer scroll + filter-state, inte bara `navigate(-1)`?
- [ ] Har varje route en tydlig `<title>` / aktiv state i sidebar?
- [ ] Finns route-guard (auth-check) eller är allt öppet? (För prototyp ofta öppet — markera ⚠️ om så.)

---

## §2 — Datamodell vs. operativa krav

**Filer att läsa:** `src/data/mock-admin.ts`, `01-supabase-schema-rls-triggers.md`, `08-schema-patchar-och-tabeller.md`.

**MCP-checks (Supabase):**
- Lista alla tabeller. Jämför mot listan i `01-supabase-schema...md`.
- Lista RLS-policies per tabell. Markera tabeller utan RLS som ❌.
- Lista functions/triggers. Verifiera att `has_role` finns och används.

**Checklista (fält som MÅSTE finnas baserat på admins svar):**
- [ ] `subscriptions.pause_until` (date) — F1.6 paus med återupptagningsdatum
- [ ] `subscriptions.scheduled_price_change` (jsonb: `{new_price, effective_at}`) — F1.1 alt. "byt pris när månaden är slut"
- [ ] `invoices.line_items` med möjlighet till **kreditrad** (negativt belopp på en specifik rad) — F1.2
- [ ] `invoices.status` inkluderar `partially_refunded` — F1.3
- [ ] `cm_assignments` (cm_id, customer_id, valid_from, valid_to) — F2.1 pro-rata-beräkning kräver historik
- [ ] `cm_assignments.scheduled_change` — F2.1 schemalägga byten + notis
- [ ] `cms.commission_rate` (default 20%, override per CM) — F10.4
- [ ] `settings.default_billing_interval` = month — F10.1
- [ ] `settings.default_payment_terms_days` = 14 — F10.2
- [ ] `settings.default_currency` = SEK — F10.3
- [ ] `customers.expected_concepts_per_week` (default 2) — F10.5
- [ ] `admin_roles` enum med minst `super_admin`, `operations_admin` — F7.3
- [ ] `audit_log`-tabell för destruktiva åtgärder (F7.1: hard delete, archive CM, void invoice)
- [ ] `cm_temporary_coverage` (cm_id, covering_for_cm_id, from, to) — F4.2/F4.3 frånvaro
- [ ] `notifications` / `events`-tabell — F6.2 "vad du missat sedan senaste login"

För varje saknat fält → ❌-fynd med exakt SQL-migration som **förslag** (inte exekvering).

---

## §3 — Billing-flöden (Stripe)

**Filer att läsa:** `src/pages/admin/Billing.tsx`, `02-stripe-byok-sync-webhooks.md`.

**MCP-checks (Stripe — test mode):**
- Lista `products` och `prices`. Bekräfta att månadspris-modellen (3000 kr grundpris + extra rader) är representerad.
- Lista webhook endpoints. Verifiera att följande events har handler: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `credit_note.created`.
- Lista senaste 20 events och kolla efter `failed`-status.

**Checklista (mappa mot admins svar):**
- [ ] Mid-cycle prisändring: finns UI som skapar **två rader på samma faktura** med olika priser för olika datumintervall? (F1.1)
- [ ] Finns toggle "byt pris nu" vs "byt pris vid nästa period"? (F1.1)
- [ ] Kreditnota-modal: kan kreditera **enskild rad** (inte hela fakturan)? (F1.2)
- [ ] Kreditnota-modal: alternativ "kreditera + skapa ny korrekt faktura direkt"? (F1.2)
- [ ] `partially_refunded` har egen badge-färg och kan filtreras? (F1.3)
- [ ] Manuell faktura: stöd för engångsavgifter ovanpå abonnemang (A i F1.4)?
- [ ] Möjlighet att **lägga till rader på kommande (ännu ej genererad) faktura**? (F1.4 — admin nämner detta explicit)
- [ ] Rabatt-modal kallas "prissänkning" / "erbjudande" (inte "rabatt")? (F1.5)
- [ ] Default rabatt-duration = 1 månad? (F1.5)
- [ ] Paus-modal med `pause_until`-datum + auto-reaktivering? (F1.6)
- [ ] Avsluta-abonnemang-modal har 3 val: cancel_at_period_end / cancel_now_no_refund / cancel_now_with_credit? (F3.1)
- [ ] `past_due`: finns visuell case-state men **ingen** auto-blockering av kund-app? (F3.3)
- [ ] Webhook-failures synliga i Health-tab med retry-knapp?

---

## §4 — CM-ekonomi och payroll

**Filer att läsa:** `src/pages/admin/Team.tsx`, `09-grafik-och-berakningslogik.md`.

**Checklista:**
- [ ] Finns `Payroll`-sida eller -sektion alls? (Saknas troligen → ❌)
- [ ] Finns historik-tabell `cm_assignments` med valid_from/valid_to för pro-rata? (§2)
- [ ] Beräkning för CM-byte mid-month använder **dagar** (F2.1 = A) och hanterar standard 25→25 billing-cykel?
- [ ] Visar CM-profil **vilka kunder** CM hade under **vilken period** (synlig kalkyl)? (F2.1)
- [ ] Schemaläggning av CM-byte med datum + notis till admin när bytet sker? (F2.1)
- [ ] Pausad kund → **ingen** provision för CM den månaden (F2.2)?
- [ ] Engångsavgifter ger **ingen** auto-provision — manuellt tillägg möjligt? (F2.3)
- [ ] Lönebudget per månad summeras korrekt: `total_MRR_per_cm × commission_rate`? (F2.5: 15000 → 3000)
- [ ] `commission_rate` overridable per CM i Team-vyn? (F10.4)

---

## §5 — Kund-lifecycle

**Filer att läsa:** `src/pages/admin/Customers.tsx`, `src/pages/admin/CustomerDetail.tsx`.

**Checklista:**
- [ ] Status-fält stödjer: `invited`, `pending_payment`, `active`, `paused`, `past_due`, `cancelled`, `archived`?
- [ ] Återaktivering av arkiverad kund → behåller TikTok-koppling och historik (F3.2)?
- [ ] Skicka-ny-invite-knapp finns på kund i `invited`-status? (F3.5)
- [ ] Visuell "försening"-signal på kunder som inte slutfört onboarding (utan auto-arkivering)? (F3.5)
- [ ] Återställ-från-arkiv-flöde finns? (F3.5)
- [ ] Byta primär e-post (sync till Stripe customer email)? (F9.2)
- [ ] Byta restaurangnamn uppdaterar display men inte slug (om slug finns)? (F9.1)

---

## §6 — CM-vy & frånvaro

**Filer att läsa:** `src/pages/admin/Team.tsx`, ev. CM-portal om den finns.

**Checklista:**
- [ ] Admin kan markera **temporär omfördelning** av en CMs kunder till annan CM med datumintervall? (F4.2/F4.3)
- [ ] Vid temporär omfördelning: provision räknas till ursprunglig CM eller temporär? (Admins svar = pro-rata på dagar; verifiera implementation)
- [ ] Buffer-status och CM-aktivitet syns redan i Overview/CustomerDetail (admin nämnde det finns) — verifiera korrekthet?
- [ ] Inbjudan av ny admin-användare finns i UI? (F7.3 — admin noterar att flöde saknas)

---

## §7 — Overview & prioritering

**Filer att läsa:** `src/pages/admin/Overview.tsx`.

**Checklista:**
- [ ] "Behöver åtgärd"-listan finns redan — verifiera att den innehåller minst: `past_due`-fakturor, CMs med 0/låg aktivitet, schemalagda CM-byten idag, pauser som ska reaktiveras idag. (F6.3)
- [ ] Items är **rangordnade efter severity** (akut > kan vänta > FYI)? (F6.3)
- [ ] Klick på item navigerar till rätt detaljvy med rätt scroll/anchor?
- [ ] Finns "sedan senaste login"-markör eller tidsstämpel per item? (F6.2 — A som rekommendation)

---

## §8 — Säkerhet & destruktiva åtgärder

**Filer att läsa:** alla `*Modal*`, `*Dialog*` under `src/components/`, `src/pages/admin/CustomerDetail.tsx`.

**Checklista:**
- [ ] Bekräftelsemodal krävs för: hard delete kund, arkivera CM, void faktura? (F7.1 = B)
- [ ] Modaler kräver **att man skriver** kundnamn / fakturanummer för hard delete? (Standard pattern)
- [ ] Audit log skrivs för dessa åtgärder? (Beror på §2)
- [ ] Arkivering av kund sker **automatiskt** när abonnemang slutar (F7.2 — admin nämner detta)?
- [ ] Inga "ångra"-toasts implementerade (admin valde A — direkt slutgiltig + modal där det behövs)?

---

## §9 — Onboarding (kund)

**Filer att läsa:** alla onboarding-relaterade filer (sök efter "onboard", "invite").

**Checklista:**
- [ ] Invite-mail → välj lösenord → onboarding (pre-payment) → betalning → landing. Verifiera att varje steg har:
  - tydligt error-state vid avbrott
  - möjlighet att hämta tillbaka kunden om de fastnar (admin nämner: skicka ny invite)
- [ ] CM-bild + samarbets-utformning + tidslinje + game-plan visas på kundens första landing? (F8.1)
- [ ] TikTok-koppling görs av admin/CM, inte kund (F8.2/F8.3 — admin lämnade x, men svar i F1/F8 antyder admin/CM-driven)?
- [ ] Demo-kunder kan skapas med template-data utan riktig betalning? (Admin nämner detta i F8)

---

## §10 — Cross-cutting: notifikationer, export, audit

**Checklista:**
- [ ] `NotificationBell` i header? (Saknas troligen → ❌)
- [ ] Export-knapp på `Customers` (CSV med MRR per kund för bokföring)? (Tidigare nämnt som saknat → ❌)
- [ ] `AuditLog`-sida eller -panel? (Beror på §2)
- [ ] `Settings`-sida för defaults (F10.1–F10.5)?

---

## Sammanställning efter alla segment

När §1–§10 är klara:

1. Skapa `/audit-output/00-SAMMANFATTNING.md` med:
   - Antal fynd per status (⚠️/❌/🚧) per segment
   - Top-10 fynd som blockerar dagligt operativt arbete (markera med 🔴)
   - Top-10 fynd som är "datamodell-grund" (måste in först innan UI kan byggas) (🟠)
2. Lämna över till människan för prioritering enligt `AGENT-PRIORITERINGSMATRIS.md`.

**Avsluta med exakt denna mening:** "Audit klar. Jag har inte gjort några kodändringar. Avvaktar prioritering."
