### F-4.1 — Payroll-vy för månadsersättning per CM saknas

- **Status:** ❌ saknas
- **Förväntat (källa):** `UI-BRAINSTORM-V3-FLOWS-OCH-OPERATIV-LOGIK.md` S-03 — lönerapport på `/admin/team/payroll` ska summera per CM per månad; komponentlistan nämner `PayrollPage`.
- **Faktiskt (kod-ref):** `app/src/app/admin/team/page.tsx:47-217` — Team-sidan visar bara nuvarande CM-kort, kundlista och redigeringsdialoger; det finns ingen payroll-sektion eller länk till månadsrapport.
- **Påverkan:** Admin saknar en operativ vy för att räkna fram och attestera CM-ersättning månad för månad.
- **Förslag (1 mening):** Lägg till en separat payroll-vy som summerar provisionsunderlag per period i stället för att bara visa nuvarande MRR.
- **Prioritet (preliminär):** Must
- **Beroenden:** F-2.3, F-2.4

### F-4.2 — CM-byte räknas inte pro-rata på dagar över billingperiod 25→25

- **Status:** ❌ saknas
- **Förväntat (källa):** `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F2.1 — "A som gäller" med automatisk kalkyl och standardiserad billingperiod 25 till 25:e.
- **Faktiskt (kod-ref):** `app/src/components/admin/customers/modals/ChangeCMModal.tsx:44-71` — CM-byte sparar bara en ny `account_manager` direkt på kunden; ingen datumstyrd fördelning, periodgräns eller pro-rata-beräkning görs.
- **Påverkan:** Mid-month-byten kan inte ge korrekt ersättningsunderlag och blir ekonomiskt odefinierade för både avlämnande och övertagande CM.
- **Förslag (1 mening):** Spara CM-byten som periodiserade assignment-rader och beräkna ersättning per dag inom vald billingperiod.
- **Prioritet (preliminär):** Must
- **Beroenden:** F-2.3, F-2.4

### F-4.3 — Team-vyn visar bara nuvarande kunder, inte historik per period

- **Status:** ⚠️ avvikelse
- **Förväntat (källa):** `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F2.1 — "vilka kunder som servas av vilken CM under vilka perioder, med den uträkningen synlig".
- **Faktiskt (kod-ref):** `app/src/app/admin/team/page.tsx:153-205` — varje CM-kort listar bara aktuell kundportfölj utan `valid_from`, `valid_to` eller någon historisk ersättningsförklaring.
- **Påverkan:** Admin kan inte granska hur ett löneunderlag uppstått eller följa handovers bakåt i tiden från teamvyn.
- **Förslag (1 mening):** Visa assignments historiskt med datumintervall och periodiserad ersättningsöversikt per CM.
- **Prioritet (preliminär):** Should
- **Beroenden:** F-2.3

### F-4.4 — CM-byte kan inte schemaläggas eller notifieras när det träder i kraft

- **Status:** ❌ saknas
- **Förväntat (källa):** `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F2.1 — byten "bör också gå att schemalägga" med "notis som säger till när en kund och CM ska byta".
- **Faktiskt (kod-ref):** `app/src/components/admin/customers/modals/ChangeCMModal.tsx:32-71` — modalen innehåller bara nuvarande val och en direkt sparknapp; inget datumfält, ingen handover-anteckning och ingen notifieringsmekanism.
- **Påverkan:** Admin måste komma ihåg framtida handovers manuellt och riskerar att missa genomförandet på rätt datum.
- **Förslag (1 mening):** Lägg till datumstyrd schemaläggning och koppla den till en admin-notis när bytet ska träda i kraft.
- **Prioritet (preliminär):** Must
- **Beroenden:** F-2.3, F-2.10

### F-4.5 — Pausade och övriga icke-aktiva kunder räknas fortfarande in i ersättningsunderlaget

- **Status:** ⚠️ avvikelse
- **Förväntat (källa):** `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F2.2 — "ingen fakturering, ingen provision" när kunden är pausad.
- **Faktiskt (kod-ref):** `app/src/app/api/admin/team/overview/route.ts:88-91` och `app/src/hooks/admin/useTeam.ts:162-165` — teamöversikten hämtar alla icke-arkiverade kunder och summerar deras `monthly_price` till `mrr_ore` utan att exkludera pausade, `past_due` eller andra icke-provisionsgrundande tillstånd.
- **Påverkan:** Team-vyn kan visa för högt löneunderlag och ge fel ekonomisk bild när kund är pausad eller inte ska ge provision.
- **Förslag (1 mening):** Begränsa payroll-underlaget till provisionsgrundande perioder och exkludera pausade dagar från summeringen.
- **Prioritet (preliminär):** Must
- **Beroenden:** F-2.1, F-2.3

### F-4.6 — `commission_rate` är hårdkodad till 20% och kan inte overridas per CM

- **Status:** ❌ saknas
- **Förväntat (källa):** `AGENT-AUDIT-PLAYBOOK.md` §4 / F10.4 — `commission_rate` ska kunna overridas per CM i Team-vyn.
- **Faktiskt (kod-ref):** `app/src/app/admin/team/page.tsx:105-121` — hover-kortet räknar alltid `~20% ersattning` med `member.mrr_ore * 0.2`; inget fält för individuell procentsats exponeras i UI eller API.
- **Påverkan:** Admin kan inte hantera avtalade avvikelser per CM utan extern lönehantering utanför systemet.
- **Förslag (1 mening):** Lagra och visa `commission_rate` per CM och använd den i alla löne- och prognosberäkningar.
- **Prioritet (preliminär):** Must
- **Beroenden:** F-2.4
