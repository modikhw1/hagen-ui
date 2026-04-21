# LeTrend Admin — Prioriteringsmatris för agenten

**Syfte:** När `AGENT-AUDIT-PLAYBOOK.md` är körd och fynd ligger i `/audit-output/`, använder agenten detta dokument för att **rangordna** fynd och föreslå **implementationsordning**. Inga ändringar utan att människan godkänt prioriteringslistan först.

---

## Klassificeringsregler (strikt — gissa inte)

Varje fynd får exakt EN av fyra prioriteter. Använd reglerna nedan i ordning — första som matchar vinner.

### 🔴 MUST — blockerar dagligt operativt arbete

Matchar om **något** av följande gäller:
- Admin kan inte slutföra ett återkommande månadsflöde (lön, fakturering, CM-byte, paus).
- Pengar riskerar bli fel (felaktig provision, fel fakturabelopp, ingen kreditmöjlighet).
- Datamodell saknar fält som **flera** UI-flöden i AUDIT-§3–§5 är beroende av.
- Säkerhet/RLS saknas på tabell med kund- eller betalningsdata.

Källor i admins svar: F1.1, F1.2, F2.1, F2.5, F3.1, F3.3, F6.3, F7.1, F10.1–F10.4.

### 🟠 SHOULD — saknad funktion som tvingar admin till workaround utanför appen

Matchar om:
- Admin kan lösa det manuellt i Stripe/Supabase/Gmail idag, men det skapar friktion **varje vecka**.
- Funktionen är en uppenbar förlängning av redan implementerad UI.
- Filter/sök/state-bevarande som admin redan flaggat som irriterande.

Källor: F1.4 (extra rader på kommande faktura), F1.6 (paus med datum), F3.5 (re-invite), F4.2/F4.3 (frånvaro/täckning), F6.2 (sedan-senaste-login), F7.3 (multi-admin invite), §1-checkpunkt om filter-bevarande, §10 export.

### 🟡 NICE — förbättrar UX men har manuell workaround utan månatlig friktion

Matchar om:
- Workaround tar < 5 min och händer < 1 gång/månad.
- Funktion är "trevligare" version av något som redan fungerar.

Exempel: bättre eskaleringsfärger, schemalagda CM-byten med notis, "prissänkning" som copy istället för "rabatt", välkomstvideo i onboarding.

### ⚪ LATER — admin har explicit sagt "inte nu" eller "framtida"

Matchar om admins svar innehåller "senare", "framtida", "kommer senare", "x" (lämnat tomt avsiktligt), eller "YAGNI"-liknande.

Exempel: F1.4 "kund utan abonnemang", F2.6 grundlön CM, F8.2/F8.3 (lämnade x), F9.3 multi-tenant, F9.4 historisk fakturafel-massrättning.

---

## Beslutsträd per fynd (kör mekaniskt)

```
Är fyndet i §2 (datamodell) OCH refereras av ≥2 UI-checkpunkter?
  → 🟠 SHOULD med tagg [foundation] (måste in före UI som beror på det)
  → Om datat rör pengar/RLS: uppgradera till 🔴 MUST.

Annars: matcha mot MUST-reglerna ovan.
  → om träff: 🔴
  → annars matcha SHOULD → 🟠
  → annars matcha LATER → ⚪
  → annars: 🟡
```

Om beslutsträdet ger 🚧 (oklart), lämna prioritet tom och listan fyndet i `OPEN-PRIORITY-QUESTIONS.md`.

---

## Beroendegraf (måste byggas i ordning)

Agenten ska **inte** föreslå att bygga UI för X innan datamodellen för X finns. Använd denna ordning:

1. **Foundation (datamodell + RLS)** — alla 🟠[foundation] + 🔴 som rör schema.
   Specifikt:
   - `cm_assignments`-historik (block för all CM-ekonomi)
   - `subscriptions.pause_until` + `scheduled_price_change`
   - `invoices.line_items` med kreditrad-stöd
   - `settings`-tabell för defaults (F10.x)
   - `audit_log`
   - `notifications`/`events`
2. **Stripe-sync** — webhook-handlers för events listade i AUDIT §3.
3. **Billing-UI** — modaler för kreditnota, prisändring, paus.
4. **Payroll-UI** — ny sida som läser från `cm_assignments`.
5. **Lifecycle-fix** — re-invite, filter-bevarande, status-utökningar.
6. **Overview-prioritering** — severity-sortering + "sedan senaste login".
7. **Settings + Multi-admin** — defaults-UI + admin-invite.
8. **Notifications + Export + AuditLog** — cross-cutting.
9. **Nice-tier** — copy-ändringar, schemalagda byten med notis, etc.

Inom varje block: agenten levererar en PR/commit i taget, väntar på godkännande, går vidare.

---

## Output-format för prioriteringsrapport

Agenten skriver `/audit-output/PRIORITY-PLAN.md`:

```markdown
# Prioriteringsplan

## 🔴 MUST (N st)
| ID | Titel | Segment | Beroende | Estimat (S/M/L) |
|----|-------|---------|----------|-----------------|
| F-2.3 | Saknat fält cm_assignments.valid_to | §2 | — | S |
| ... |

## 🟠 SHOULD (N st)
...

## 🟡 NICE (N st)
...

## ⚪ LATER (N st)
...

## Föreslagen leveransordning (kör block för block)
1. **Block A — Foundation (X fynd):** F-2.1, F-2.3, F-2.7, ...
2. **Block B — Stripe-sync (X fynd):** ...
...

## Frågor som blockerar (🚧)
- F-X.Y: {kort beskrivning + vilket val som behövs}
```

---

## Förbjudna mönster (agenten får INTE göra dessa)

- ❌ Lägga till features som inte finns i något V2/V3/Operativ-fynd ("Jag tänkte också att en dashboard-widget för...").
- ❌ Refaktorera sidor som inte har ett ⚠️/❌-fynd i sitt segment.
- ❌ Byta UI-bibliotek, design-tokens, route-struktur utan explicit godkännande.
- ❌ Implementera 🟡 NICE eller ⚪ LATER innan ALLA 🔴 i berört block är klara.
- ❌ Skapa nya tabeller utan motsvarande RLS-policy i samma migration.
- ❌ "Förbättra" copy från svenska till engelska eller tvärtom.
- ❌ Lägga till toasts/popups (admin har sagt: inline-only).

---

## När agenten är osäker

Skriv frågan till `/audit-output/OPEN-PRIORITY-QUESTIONS.md` i formatet:

```
### Q-{nr}: {fråga i en mening}
- **Kontext:** {1-3 meningar}
- **Alternativ:**
  - A) {konkret val}
  - B) {konkret val}
- **Default om inget svar:** {agentens minst-risk-val, alltid det som bevarar mest existerande beteende}
```

Vänta **maximalt 24h** virtuellt — om människan inte svarat, fortsätt med default-valet och markera fyndets prioritet som 🟡 NICE (degraderas tills besvarat).

---

## Avslutning

När `PRIORITY-PLAN.md` är skriven, agenten säger exakt:

> "Prioriteringsplan klar. {X} MUST, {Y} SHOULD, {Z} NICE, {W} LATER. {N} öppna frågor i OPEN-PRIORITY-QUESTIONS.md. Klar att börja Block A på godkännande."

Inga andra ord. Ingen kod skriven förrän människan svarar "kör Block A" eller motsvarande.
