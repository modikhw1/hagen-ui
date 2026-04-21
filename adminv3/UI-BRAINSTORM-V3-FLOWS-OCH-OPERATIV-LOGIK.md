# UI-BRAINSTORM V3 — Förväntade flöden, beteenden, hover-states & operativa beslutsfrågor

**Syfte:** Detta dokument är ett körbart prompt-paket för en AI-agent (Claude/Cursor) som ska:
1. Inventera **varje knapp, länk, hover, modal, tomtillstånd och keyboard-shortcut** i `/admin` och dess subsidor.
2. För varje interaktion definiera **förväntat beteende** (happy path, edge case, error, loading, empty, hover, focus, disabled, optimistic vs. pessimistic update).
3. Lyfta **operativa beslutsfrågor** som produktägaren måste svara på innan implementation — formulerade som konkreta affärsscenarier (kreditnota, prisändring mid-cycle, CM-byte med 20%-provision, etc.).

Detta dokument **kompletterar** `UI-BRAINSTORM-V2-KATEGORISERAT.md` (som täcker systemarkitektur och edge cases) genom att fokusera på **interaktionsdesign + operativa policies**.

---

## DEL 0 — Hur agenten ska arbeta

### Arbetsmetod (sekventiell)

**Fas A — Inventering (read-only):**
1. Läs samtliga filer under `/src/pages/admin/**`, `/src/components/admin/**`, `/src/components/ui/**` (för hover/focus-defaults).
2. Bygg en **interaktionsmatris** (markdown-tabell) per sida. Kolumner:
   `Element | Typ (button/link/row/icon/input) | Nuvarande beteende | Förväntat beteende | Hover/Focus | Disabled-villkor | Loading-state | Error-state | Empty-state | Bekräftelsekrav | Audit-event | Öppna frågor`
3. För varje element där "Förväntat beteende" är okänt → generera en **operativ beslutsfråga** (se mall i Del 4).

**Fas B — Operativ logik (frågedrivet):**
1. Gå igenom Del 3 (operativa scenarier). För varje scenario:
   - Beskriv **nuvarande tillstånd** i appen (vad händer just nu om scenariot inträffar).
   - Beskriv **idealt flöde** med UI-steg, modaler, bekräftelser, side effects (Stripe, DB, e-mail, audit).
   - Lyft **policy-frågor** som behöver besvaras (t.ex. "ska kreditnota refundera kort eller bara nolla saldot?").

**Fas C — Leverans:**
- En markdown-rapport per sida (`flows-overview.md`, `flows-customers.md`, `flows-customer-detail.md`, `flows-billing.md`, `flows-team.md`).
- En sammanställd `OPEN-QUESTIONS.md` med alla operativa beslutsfrågor, prioriterade (P0/P1/P2).
- En `INTERACTION-MATRIX.md` med alla element från Fas A.

### Regler för agenten
- **Ändra ingen kod** i Fas A–B. Endast dokumentation.
- **Hitta inte på affärsregler.** Om en regel saknas → ställ en fråga, inte ett antagande.
- **Citera filsökväg + radnummer** när du refererar till befintlig kod.
- **Markera varje öppen fråga** med ID `Q-<sida>-<nr>` (t.ex. `Q-CUSTOMER-DETAIL-07`).
- **Använd svensk UI-terminologi** (kunden ser svenska; kod är engelska).

---

## DEL 1 — Sid- och modal-katalog att inventera

För varje sida nedan: lista **alla** interaktiva element och dokumentera enligt interaktionsmatrisen.

### 1.1 `/admin` — Overview
- Top-bar: env-toggle (Alla/Test/Live), notifikations-bell (saknas idag — föreslå), profil-dropdown.
- KPI-kort: MRR, Aktiva kunder, Pending invoices, CM-puls. **Hover** → tooltip med formel? **Click** → navigera till filtrerad vy?
- "Behöver uppmärksamhet"-lista: varje rad → click navigerar vart? Snooze-knapp? Bulk-acknowledge?
- CM-puls-widget: hover på CM-prick → tooltip med kunder. Click → Team-sidan filtrerad.
- Senaste aktivitet (om finns): live-uppdatering? Polling-intervall?

### 1.2 `/admin/customers` — Customers list
- Sökfält: debouncing? Sökfält över namn/e-post/slug/stripe_customer_id? Keyboard `/`-shortcut?
- Filter-pills: status, CM, betalningsstatus, miljö. Multi-select? URL-state?
- Sortering: kolumnheaders klickbara? Default-sortering?
- Rad-hover: visa quick actions (öppna, byt CM, pausa)?
- Rad-click: navigera till detalj.
- "+ Bjud in kund"-knapp: öppnar invite-modal.
- Pagination: URL-state? Sidstorlek-väljare?
- Empty state (inga kunder, inga sökträffar, inga filter-träffar — tre olika).

### 1.3 `/admin/customers/:id` — CustomerDetail
**Header:**
- Tillbaka-knapp: bevarar listans state?
- Kundnamn: editerbar inline?
- Status-pill: hover visar förklaring? Click ändrar status?
- "Pausa kund"-knapp: bekräftelse? Vad pausas (Stripe? CM-arbete? Båda?)
- "Arkivera kund"-knapp: bekräftelse + konsekvens-text.

**Tabbar/sektioner:**
- Översikt, Innehåll/Feedplan, Fakturor, TikTok, Inställningar, Aktivitetslogg (saknas idag).

**Modaler att täcka:**
- `DiscountModal` — applicera rabatt (procent/fast belopp, en gång/återkommande/för alltid, gäller från när?).
- `ManualInvoiceModal` — skapa engångsfaktura (rader, moms, förfallodag, skicka direkt vs. utkast).
- `ChangePriceModal` (om finns) — ändra `monthly_price`, intervall, billing-anchor. **Mid-cycle pro-rata?**
- `ChangeCMModal` — byt CM, valbar handover-text, automatisk e-post till båda CMs.
- `CreditNoteModal` (förmodligen saknas — föreslå) — kreditera hel/del av faktura, refundera till kort eller endast nolla saldo.
- `RefundModal` — partial/full refund.
- `ChangeBillingMethodModal` — kort vs. faktura (30 dagar netto).
- `ChangeBillingAnchorModal` — flytta debiteringsdag (pro-rata?).
- `CancelSubscriptionModal` — at_period_end vs. immediately, refund-policy.
- `ResendInviteModal` — skicka invite igen, regenerera token?
- TikTok-graf: hover på prick → tooltip med video-info, click → öppna video på TikTok.
- Följargraf: range-toggle 30/60/90d.

**Inline-redigering:**
- Kontaktuppgifter (namn, e-post, telefon): edit-mode, save/cancel, validering.
- Anteckningar: rich text? Vem ser dem (CM också)?

### 1.4 `/admin/billing` — Billing (3 tabbar: Invoices/Subscriptions/Health)
- Env-toggle (Alla/Test/Live).
- Tab-state i URL (`?tab=invoices`)?
- Rad-click: navigera till kund eller öppna invoice-detalj-modal?
- Hover-actions: kopiera Stripe-id, öppna i Stripe Dashboard, ladda ner PDF.
- Bulk-actions (markera flera fakturor): skicka påminnelse? Void? Export?
- Health-tab: "Synka nu"-knapp per rad. Loading-state. Felhantering.
- Reconciliation-banner (om webhook-lag detekterad).

### 1.5 `/admin/team` — Team
- CM-kort: click → CM-detalj (finns sidan?). Hover → quick stats.
- "+ Lägg till CM"-knapp: invite-flow för CM (saknas i koden — föreslå).
- Per-CM: arkivera, redigera roll, sätt frånvaro (`cm_absences`), tilldela kunder.
- Lönesammanställning (om finns): månads-vy, provisionsberäkning, export.

### 1.6 Globalt (alla sidor)
- Sidnavigering (sidebar/topbar): aktiv-state, hover, kollaps.
- Toast/inline alerts: format, timeout, dismiss.
- Globala kortkommandon: `/` sök, `g+c` customers, `g+b` billing, `?` hjälp, `Esc` stäng modal.
- Offline-detektion: banner när uppkoppling tappas.
- Session-timeout: varning före utloggning.
- Realtime-indikator: "live" vs. "stale".

---

## DEL 2 — Standardbeteenden som ska gälla varje element

För **varje** interaktivt element ska agenten verifiera/specificera:

### 2.1 Visuella states
- **Default** — normal vy.
- **Hover** — bakgrund/text-skiftning, cursor, tooltip efter 500ms delay för icon-only buttons.
- **Focus** — synlig ring (`ring-2 ring-ring`), keyboard-navigerbar.
- **Active/Pressed** — kort visuell feedback (scale eller färg).
- **Disabled** — `opacity-50 cursor-not-allowed`, tooltip förklarar varför.
- **Loading** — spinner inuti knappen, knappen disabled, originalbredd bevarad.
- **Success** — kort grön ikon (1500ms) sedan default.
- **Error** — röd ring + inline felmeddelande nedan.

### 2.2 Beteendekrav
- **Optimistisk uppdatering** vs. **pessimistisk**: definiera per action. Stripe-actions = pessimistisk. Snooze/markera läst = optimistisk.
- **Bekräftelsedialog** för destruktiva actions: kräver att användaren skriver ord (t.ex. "ARKIVERA") för irreversibla.
- **Konsekvens-text** i bekräftelsedialog: "Detta kommer att: 1) avsluta Stripe-prenumerationen, 2) ta bort CM-tilldelningen, 3) behålla fakturahistoriken."
- **Audit-event**: varje action skriver till `audit_log` (referens K08 i V2).
- **Idempotens-nyckel** för Stripe-anrop: använd `Idempotency-Key`-header med deterministisk nyckel.

### 2.3 Tomtillstånd
- "Inga data ännu" (första gången) vs. "Inga träffar" (filter) vs. "Något gick fel" (error). Tre olika UI.

### 2.4 Tillgänglighet
- Aria-labels på icon-only buttons.
- Modal: focus-trap, Esc stänger, click utanför stänger (utom destruktiva).
- Tab-ordning logisk.
- Live-regions för toasts.

---

## DEL 3 — Operativa beslutsscenarier (de viktigaste)

För varje scenario nedan ska agenten:
- Skissa **nuvarande beteende** baserat på koden.
- Skissa **idealt flöde** med UI-steg.
- Identifiera **policy-frågor** som ägaren måste besvara.
- Föreslå **datamodell-ändringar** vid behov.

---

### S-01 — Kund vill kreditera en faktura

**Trigger:** Kund mejlar/ringer och säger "fakturan är fel, jag vill ha kreditnota."

**Flöde att designa:**
1. Admin öppnar `/admin/customers/:id` → fakturahistorik → klickar fakturan.
2. Faktura-detalj-modal öppnas (finns den? — eller bara länk till Stripe?).
3. Knapp "Skapa kreditnota" → `CreditNoteModal`.
4. Modalen frågar:
   - Hela beloppet eller del?
   - Per rad (om multi-line invoice)?
   - **Refundera till kort (out_of_band: false)** eller **endast kreditera saldot (credit balance)**?
   - Anledning (Stripe har enum: duplicate, fraudulent, order_change, product_unsatisfactory).
   - Anteckning till kund (visas på kreditnotan).
5. Bekräftelse → POST till Stripe `creditNotes.create` → webhook `credit_note.created` → uppdatera `stripe_invoices`.
6. Kunden får mail från Stripe automatiskt + visas i admin.

**Policy-frågor:**
- `Q-CN-01` Får admin skapa kreditnota själv eller krävs godkännande över X kr?
- `Q-CN-02` Default refund-väg: kort eller saldo?
- `Q-CN-03` Påverkar kreditnota CM:s provision? (Om CM redan fått 20% — ska det dras av nästa månad?)
- `Q-CN-04` Ska MRR justeras retroaktivt eller bara framåt?
- `Q-CN-05` Hur visas krediterad faktura i listan? Strikethrough, badge "Krediterad", separat sektion?
- `Q-CN-06` Finns det en max-tid efter fakturadatum då kreditnota är tillåten?

**Datamodell:** Lägg till `stripe_credit_notes`-tabell synkad via webhooks.

---

### S-02 — Kund vill ändra priset mitt under månaden

**Trigger:** Kund uppgraderar/nedgraderar paket den 14:e i månaden, debitering sker den 1:a.

**Flöde att designa:**
1. `/admin/customers/:id` → "Ändra pris"-knapp → `ChangePriceModal`.
2. Modalen visar:
   - Nuvarande pris/intervall.
   - Nytt pris-input.
   - **Pro-rata-förhandsvisning** (anrop till Stripe `invoices.upcoming` med proration_behavior).
   - Val: `proration_behavior`:
     - `create_prorations` (default) — pro-rata-rad på nästa faktura.
     - `none` — nytt pris från nästa period, ingen pro-rata.
     - `always_invoice` — fakturera pro-rata omedelbart.
   - **Effective date**: omedelbart, vid nästa periodstart, anpassat datum.
3. Bekräftelse visar: "Kunden kommer debiteras X kr extra på nästa faktura (Y kr pro-rata för perioden Z–W)."
4. POST till Stripe `subscriptions.update` med `proration_behavior` + `proration_date`.
5. Audit-event + e-post till kund (egen mall, inte Stripe default).

**Policy-frågor:**
- `Q-PRICE-01` Default proration_behavior?
- `Q-PRICE-02` Får priset sättas till 0 (gratisperiod)? Bekräftelse-extra?
- `Q-PRICE-03` Ska pris-historik sparas (ny tabell `customer_price_history`)?
- `Q-PRICE-04` Påverkar prisändring mid-cycle CM:s provision **denna månad** eller **nästa**?
- `Q-PRICE-05` Vad händer med en pågående rabatt (coupon) när priset ändras?
- `Q-PRICE-06` Notifieras kunden? Vilken mall? Vem skickar (LeTrend eller Stripe)?
- `Q-PRICE-07` Får CM se prisändringen i sitt UI eller är det adminonly?

**Datamodell:** `customer_price_history (customer_id, old_price, new_price, effective_at, proration_behavior, changed_by, reason)`.

---

### S-03 — Ny CM tar över kund mid-month, provision 20%

**Trigger:** Kund X betalar 5 000 kr/mån. Den 18:e byter CM från A till B. Provision = 20% av MRR = 1 000 kr/mån.

**Frågan:** Hur fördelas 1 000 kr mellan A och B för månaden?

**Modeller att överväga:**

| Modell | Beräkning | Plus | Minus |
|---|---|---|---|
| **Pro-rata dagar** | A: 17/30 × 1000 = 567 kr; B: 13/30 × 1000 = 433 kr | Rättvist mot tid | Ignorerar arbete utfört |
| **Pro-rata aktivitet** | Räkna `cm_interactions` per CM under månaden, fördela proportionellt | Rättvist mot insats | Kräver tillförlitlig aktivitetsmätning |
| **Allt till nya CM** | B: 1000 kr; A: 0 kr | Enkelt | Orättvist mot A som redan jobbat |
| **Allt till föregående CM** | A: 1000 kr; B: 0 kr (B får från nästa månad) | Belönar arbete utfört | Demotiverar mid-month-byte |
| **Split 50/50 om byte sker mellan dag 10–20** | A: 500, B: 500 | Pragmatiskt | Godtyckligt |
| **Manuell justering** | Admin sätter fördelning vid byte | Maximal kontroll | Manuellt arbete varje gång |

**Flöde att designa:**
1. `ChangeCMModal` öppnas.
2. Välj ny CM, datum (default idag), handover-anteckning.
3. Visa **provisionsberäknings-förhandsvisning** för innevarande månad enligt vald modell.
4. Möjlighet att override fördelning manuellt.
5. Spara → `cm_assignments`-tabell (ny) får ny rad med `valid_from`/`valid_to`. Ingen mutation av historik.
6. Lönerapport (`/admin/team/payroll` — föreslå sida) summerar per CM per månad baserat på `cm_assignments` × pris × 20% × andel.

**Policy-frågor:**
- `Q-CM-01` Vilken provisionsmodell ska gälla som default?
- `Q-CM-02` Ska CM:n se sin egen provisionsberäkning?
- `Q-CM-03` Vad händer om kunden pausas mid-month — räknas pausade dagar i provisionen?
- `Q-CM-04` Vad händer vid kreditnota — clawback från CM nästa månad?
- `Q-CM-05` Vad händer om kund cancelar at_period_end mid-month — får CM full månad?
- `Q-CM-06` Kan en kund ha **två CMs samtidigt** (under övergångsvecka)? Hur splittas provision då?
- `Q-CM-07` Är 20% fast eller per CM-roll/per kund-segment?
- `Q-CM-08` Vid byte: ska gamla CM:n få "exit-bonus" eller dras av om CM lämnar kund i dåligt skick?
- `Q-CM-09` Lönerapport: per kalendermånad eller per Stripe-billing-period?
- `Q-CM-10` Avrundning (öre, kr, närmsta 10-kr)?

**Datamodell:**
- `cm_assignments (id, customer_id, cm_user_id, valid_from, valid_to, commission_pct_override, allocation_pct_override, handover_note, created_by)`
- `cm_payroll_periods (id, cm_user_id, period_start, period_end, total_commission, status, paid_at, payslip_url)`
- View `cm_commission_calc_v` som joinar `cm_assignments` × `customer_subscriptions` × dagar × procent.

---

### S-04 — Kund vill pausa abonnemang (semester, säsong)

**Flöde:**
1. "Pausa kund"-knapp → `PauseModal`.
2. Frågor:
   - Pausa Stripe-debiteringen (`subscription.pause_collection`) eller bara CM-arbetet (`customer.status = paused`)?
   - Pausa till specifikt datum eller tills vidare?
   - Behåll TikTok-sync?
   - Notifiera CM?
3. Om Stripe pausas: `pause_collection.behavior`: `keep_as_draft`, `mark_uncollectible`, `void`.

**Policy-frågor:**
- `Q-PAUSE-01` Default-läge: pausa båda eller bara CM?
- `Q-PAUSE-02` Räknas paus mot CM-provision?
- `Q-PAUSE-03` Auto-resumera vid datum eller kräver manuell action?
- `Q-PAUSE-04` Visas pausade kunder i Overview-KPI:er eller exkluderas?
- `Q-PAUSE-05` Max paus-längd innan kunden auto-arkiveras?

---

### S-05 — Failed payment → past_due → unpaid → canceled

**Flöde Stripe Smart Retries** (default: 4 försök över 3 veckor).

**UI-krav vid varje state-övergång:**
- `past_due`: röd badge på kund, alert i Overview, e-post till admin (ej kund — Stripe gör det).
- `unpaid` (efter alla retries): kund får `customers.status = blocked`, app-access stängs, CM får notis "kund blockerad".
- `canceled`: arkivera-flow startas? Eller behåll som "churned"?

**Policy-frågor:**
- `Q-DUNNING-01` Egen dunning-mall (Resend) utöver Stripes egen, eller bara Stripe?
- `Q-DUNNING-02` När blockeras app-access — vid `past_due` eller `unpaid`?
- `Q-DUNNING-03` Får CM fortsätta arbeta under `past_due`? (Risk: CM jobbar gratis.)
- `Q-DUNNING-04` Ska blockerad kund visas i CM:s lista alls?
- `Q-DUNNING-05` Vid återkomst (kund betalar) — auto-resumera CM-arbete eller kräv admin-action?
- `Q-DUNNING-06` Provision för månad där kund hamnade i `unpaid` — clawback eller inte?

---

### S-06 — Kund vill byta från månadsvis till årsvis

**Flöde:**
1. `ChangeBillingIntervalModal`.
2. Pro-rata-beräkning (Stripe `invoices.upcoming`).
3. Visa: "Kunden får X kr kredit för outnyttjad månad, ny årsfaktura Y kr förfaller idag."
4. Ev. rabatt vid årsval (10%? 15%?).

**Policy-frågor:**
- `Q-INTERVAL-01` Standardrabatt vid årsbetalning?
- `Q-INTERVAL-02` MRR-beräkning: dela årspris med 12?
- `Q-INTERVAL-03` Provision: betala CM månadsvis även när kund betalar årsvis? (Vanligast: ja, baserat på MRR.)
- `Q-INTERVAL-04` Vid cancel mid-year — refundera oanvända månader?

---

### S-07 — Kund vill ha refund (inte kreditnota, faktiskt återbetala kort)

**Skillnad mot S-01:** Kreditnota = Stripe-koncept som påverkar saldo/skattepost. Refund = pengar tillbaka till kort.

**Flöde:**
- `RefundModal` med val: full/partial, anledning, notify_customer.
- Stripe `refunds.create`.

**Policy-frågor:**
- `Q-REFUND-01` Krävs alltid kreditnota innan refund (för bokföring)?
- `Q-REFUND-02` Vem får godkänna refund > 5 000 kr?

---

### S-08 — Manuell engångsfaktura (extra arbete, foto-session, etc.)

**Flöde via `ManualInvoiceModal`:**
1. Välj kund (om från Billing-sida).
2. Lägg till rader (beskrivning, antal, à-pris, momssats).
3. Förfallodag.
4. Skicka direkt vs. spara som utkast.
5. Bifoga PDF-bilaga?

**Policy-frågor:**
- `Q-MANUAL-01` Skapas det som separat Stripe-invoice (`invoiceitems.create` + `invoices.create`) eller läggs till på nästa subscription-faktura (`invoiceitems.create` utan invoice)?
- `Q-MANUAL-02` Räknas manuella fakturor in i MRR? (Vanligast: nej, det är "one-time revenue".)
- `Q-MANUAL-03` Ger manuella fakturor CM-provision? (Sannolikt nej om det är admin-arbete; ja om CM utfört arbetet.)
- `Q-MANUAL-04` Default momssats?
- `Q-MANUAL-05` Får CM skapa förslag på manuell faktura som admin godkänner?

---

### S-09 — Rabattkupong (engångs / återkommande / för alltid)

**Flöde via `DiscountModal`:**
- Procent eller fast belopp.
- Duration: `once`, `repeating` (X månader), `forever`.
- Gäller från: omedelbart eller nästa period.
- Skapa ny coupon eller använd befintlig?

**Policy-frågor:**
- `Q-DISC-01` MRR-beräkning: nettorisk efter rabatt?
- `Q-DISC-02` Provision: 20% av nettoMRR (efter rabatt) eller bruttoMRR?
- `Q-DISC-03` Visa "rabatt löper ut om X dagar"-varning hur tidigt?
- `Q-DISC-04` Får CM se vilka kunder som har rabatt?

---

### S-10 — CM blir sjuk / går på semester

**Flöde:**
1. Team-sidan → CM-kort → "Sätt frånvaro".
2. `CMAbsenceModal`: typ (sjuk/semester/föräldraledig/annat), från-till-datum, ersättare.
3. Optionellt: tillfälligt omfördela kunder till ersättare (`cm_assignments` med `valid_to = återkomst`).
4. Status-pillar för kunder under frånvaro: ignorera röd-färgning (CM-frånvaro räknas inte mot pulsen).

**Policy-frågor:**
- `Q-ABSENCE-01` Provision under frånvaro: full lön (semester), 80% (sjuk), eller pausad?
- `Q-ABSENCE-02` Ersättare får tillfällig provision för perioden?
- `Q-ABSENCE-03` Auto-återgå vid datum eller kräv aktivering?
- `Q-ABSENCE-04` Notifiera kunder? (Sannolikt nej.)

---

### S-11 — Onboarding stannar upp (kund klickar invite men slutför inte)

**Trigger:** Kund klickar invite-länk dag 0, skapar konto, men kopplar aldrig TikTok eller fyller inte i restauranguppgifter.

**Förväntat:**
- Dag 1–2: ingen action.
- Dag 3: påminnelse-mail till kund.
- Dag 7: alert till tilldelad CM ("kund har inte slutfört onboarding").
- Dag 14: alert till admin.
- Dag 30: auto-arkivera? Eller bara flagga?

**Policy-frågor:**
- `Q-ONBOARD-01` Vilken steg-sekvens har onboarding (TikTok, restauranguppgifter, kontaktperson, godkänn villkor)?
- `Q-ONBOARD-02` Vilka steg är obligatoriska för att kund räknas som `active`?
- `Q-ONBOARD-03` Påminnelse-kadens (3, 7, 14)?
- `Q-ONBOARD-04` Får CM "puffa" via in-app-message eller bara mail?

---

### S-12 — Slug-kollision vid invite (två restauranger heter "Bistro Nord")

**Förväntat:**
- Slug genereras från namn → `bistro-nord`.
- Vid kollision: `bistro-nord-2`, `bistro-nord-stockholm` (om stad finns), eller manuellt val i invite-modalen.

**Policy-frågor:**
- `Q-SLUG-01` Auto-suffix `-2`/`-3` eller kräv manuell input?
- `Q-SLUG-02` Vad händer om kund byter namn senare — uppdatera slug eller behålla? Redirect från gammal slug?

---

### S-13 — Kund vill ändra fakturamottagare/momsuppgifter

**Flöde:**
- `BillingDetailsModal`: företagsnamn, org.nr, momsnr, fakturaadress, e-post för fakturor.
- Skickas till Stripe `customers.update`.

**Policy-frågor:**
- `Q-INVOICE-DETAILS-01` Reverse charge för EU-företag utanför Sverige?
- `Q-INVOICE-DETAILS-02` Validera org.nr/VAT-nr mot extern tjänst (VIES)?

---

## DEL 4 — Mall för operativa frågor

```markdown
### Q-<KATEGORI>-<NR>: <Kort fråga>

**Kontext:** Vilket scenario / vilken vy.
**Nuvarande beteende:** Vad händer idag (citat från koden).
**Alternativ:**
1. **A)** ...
2. **B)** ...
3. **C)** ...
**Rekommendation:** Vilket alternativ agenten lutar mot + varför.
**Beroenden:** Andra Q-frågor som måste besvaras först.
**Påverkade ytor:** Sidor/komponenter/tabeller som ändras.
**Implementation effort:** S/M/L.
```

---

## DEL 5 — Master-prompt att klistra in i Claude/Cursor

```
Du är en senior produktdesigner + fullstack-arkitekt som hjälper LeTrend att specificera
sin admin-dashboard inför implementation i originalrepot (Next.js + Supabase + Stripe).

Du har följande dokument tillgängliga i denna repo:
- /docs/letrend-admin-plan/00-README-och-leveransöversikt.md
- /docs/letrend-admin-plan/01-supabase-schema-rls-triggers.md
- /docs/letrend-admin-plan/02-stripe-byok-sync-webhooks.md
- /docs/letrend-admin-plan/03-api-routes-och-auth-lager.md
- /docs/letrend-admin-plan/04-ui-paritet-komponenter-hooks-sidor.md
- /docs/letrend-admin-plan/05-tiktok-integration.md
- /docs/letrend-admin-plan/06-implementationsordning-och-acceptanstester.md
- /docs/letrend-admin-plan/07-operativ-modell-och-koncept.md
- /docs/letrend-admin-plan/08-schema-patchar-och-tabeller.md
- /docs/letrend-admin-plan/09-grafik-och-berakningslogik.md
- /docs/letrend-admin-plan/UI-BRAINSTORM-V2-KATEGORISERAT.md
- /docs/letrend-admin-plan/UI-BRAINSTORM-V3-FLOWS-OCH-OPERATIV-LOGIK.md  ← detta dokument

Samt prototyp-koden under /prototype/src/**.

DITT UPPDRAG (kör sekventiellt, leverera markdown-rapporter):

FAS A — INTERAKTIONSMATRIS (read-only på koden)
1. För varje sida i Del 1 (Overview, Customers, CustomerDetail, Billing, Team):
   - Inventera alla interaktiva element.
   - Skriv en tabell enligt Del 2-format.
   - Markera saknade states (hover/focus/loading/empty/error/disabled).
   - Skapa en fil per sida: docs/flows/flows-<sida>.md.

FAS B — OPERATIVA SCENARIER
2. Gå igenom alla scenarier S-01 till S-13 i Del 3.
   - Beskriv nuvarande beteende baserat på koden (citera fil:rad).
   - Skissa idealt flöde med UI-steg, modaler, side effects.
   - Lista alla policy-frågor enligt mallen i Del 4.
   - Föreslå datamodell-ändringar (SQL-skiss).
   - Skapa en fil per scenario: docs/flows/scenario-<id>-<slug>.md.

FAS C — KONSOLIDERING
3. Skapa docs/flows/OPEN-QUESTIONS.md med alla Q-<...>-frågor sorterade efter prioritet.
   - P0: blockerar implementation.
   - P1: krävs innan release.
   - P2: nice-to-have / kan defaultas.
4. Skapa docs/flows/INTERACTION-MATRIX.md som master-tabell över Fas A.
5. Skapa docs/flows/IMPLEMENTATION-ORDER.md med rekommenderad ordning baserat på beroenden.

REGLER:
- Ändra ingen kod i Fas A–C. Endast dokumentation.
- Citera fil:rad vid varje referens till befintlig kod.
- Hitta inte på affärsregler — om en regel saknas → ställ Q-fråga.
- Använd svensk UI-text, engelsk kod-terminologi.
- Markera varje antagande explicit som "ANTAGANDE:" så ägaren kan validera.
- Föredra fåtal stora dokument framför många små; max 7 filer i docs/flows/.

Börja med Fas A, sida 1 (Overview). Pausa efter varje sida och be om bekräftelse innan
nästa.
```

---

## DEL 6 — Förslag på nya UI-element som saknas idag

Agenten ska föreslå (men inte implementera) följande nya komponenter som identifierats som luckor:

| Komponent | Plats | Syfte |
|---|---|---|
| `NotificationBell` | Topbar | Visa olästa `admin_alerts` |
| `ActivityLog` | CustomerDetail-tab | Komplett historik per kund |
| `PayrollPage` | `/admin/team/payroll` | Månads-provision per CM |
| `CreditNoteModal` | Faktura-detalj | Skapa kreditnota |
| `RefundModal` | Faktura-detalj | Refundera till kort |
| `ChangePriceModal` | CustomerDetail | Mid-cycle prisändring med pro-rata-preview |
| `ChangeIntervalModal` | CustomerDetail | Månads ↔ års-byte |
| `PauseSubscriptionModal` | CustomerDetail | Pausa Stripe + CM-arbete |
| `CMAbsenceModal` | Team | Sätt sjuk/semester |
| `HandoverModal` | CustomerDetail | CM-byte med anteckning |
| `OnboardingChecklistWidget` | CustomerDetail | Visa kvarvarande onboarding-steg |
| `GlobalSearch` | Topbar (`/`) | Snabbsök kund/CM/faktura |
| `OfflineBanner` | Globalt | Visa när uppkoppling tappats |
| `SessionTimeoutDialog` | Globalt | Varna före utlogg |
| `ReconciliationBanner` | Billing/Health | Visa när webhook-lag detekterad |

---

## DEL 7 — Acceptanskriterier för dokumentet (när är agenten klar?)

- [ ] Alla 5 sidor har en `flows-<sida>.md` med komplett interaktionsmatris.
- [ ] Alla 13 scenarier har egen `scenario-<id>.md` med policy-frågor.
- [ ] `OPEN-QUESTIONS.md` innehåller minst 60 Q-frågor (10+ från varje scenario, sortrade P0/P1/P2).
- [ ] `IMPLEMENTATION-ORDER.md` listar beroenden mellan frågor.
- [ ] Inga kodändringar gjorda — endast dokumentation.
- [ ] Varje antagande markerat med `ANTAGANDE:`.
- [ ] Ägaren (du) kan läsa dokumentet och svara ja/nej/alternativ på varje Q-fråga utan att läsa kod.

---

**Slut på V3-dokument.** Använd tillsammans med V2 (kategoriserade edge cases) och dokument 00–09 (implementation-plan).
