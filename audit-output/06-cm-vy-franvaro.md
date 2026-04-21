### F-6.1 — Temporär omfördelning med datumintervall saknas

- **Status:** ❌ saknas
- **Förväntat (källa):** `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F4.2/F4.3 — admin ska kunna koppla in en annan CM temporärt när någon är frånvarande.
- **Faktiskt (kod-ref):** `app/src/components/admin/customers/modals/ChangeCMModal.tsx:73-151` — CM-byte sker som ett permanent direktval utan start-/slutdatum eller markering av att bytet är temporärt.
- **Påverkan:** Frånvaro kan inte modelleras som tillfällig coverage utan blir ett permanent kundbyte i data och UI.
- **Förslag (1 mening):** Lägg till coverage-flöde med datumintervall och särskilj temporär omfördelning från permanent handover.
- **Prioritet (preliminär):** Must
- **Beroenden:** F-2.3, F-2.9

### F-6.2 — Provision och ansvar vid temporär coverage kan inte särskiljas

- **Status:** ❌ saknas
- **Förväntat (källa):** `AGENT-AUDIT-PLAYBOOK.md` §6 — vid temporär omfördelning ska systemet kunna verifiera om provision går till ursprunglig eller temporär CM enligt pro-rata på dagar.
- **Faktiskt (kod-ref):** `app/src/hooks/admin/useTeam.ts:124-165` — teamderivaten känner bara till nuvarande kundtilldelning och summerar MRR per CM utan att skilja på ordinarie ansvar och temporär täckning.
- **Påverkan:** Admin kan inte avgöra vem som ska ha ekonomiskt ansvar eller ersättning under en frånvaroperiod.
- **Förslag (1 mening):** Beräkna ersättning och ansvar från periodiserade assignment-/coverage-rader i stället för från nuvarande kundägare.
- **Prioritet (preliminär):** Must
- **Beroenden:** F-2.3, F-2.4, F-2.9

### F-6.3 — UI för att bjuda in ny admin-användare saknas

- **Status:** ⚠️ avvikelse
- **Förväntat (källa):** `AGENT-AUDIT-PLAYBOOK.md` §6 / F7.3 — inbjudan av ny admin-användare ska finnas i UI.
- **Faktiskt (kod-ref):** `app/src/components/admin/team/AddCMDialog.tsx:28-214` — dialogen skapar bara "CM" utan rollval, medan `app/src/app/api/admin/team/route.ts:168-178` faktiskt stödjer `role` på API-nivå.
- **Påverkan:** Administratörskonton kan inte skapas genom UI:t trots att backend redan kan särskilja admin och content manager.
- **Förslag (1 mening):** Exponera rollval i inbjudningsdialogen och tillåt admin-invites som egen UI-väg.
- **Prioritet (preliminär):** Should
- **Beroenden:** F-2.7

### F-6.4 — UI för att sätta CM-frånvaro saknas helt

- **Status:** ❌ saknas
- **Förväntat (källa):** `UI-BRAINSTORM-V3-FLOWS-OCH-OPERATIV-LOGIK.md:104`, `:370-371` och `:520` — Team-vyn ska ha "Sätt frånvaro" per CM och en `CMAbsenceModal` med typ, datumintervall och ersättare.
- **Faktiskt (kod-ref):** `app/src/app/admin/team/page.tsx:47-149` visar bara sortering, `+ Lägg till` och `Redigera`, och `rg -n "absence|frånvaro|cm_absences"` över `app/src`/`supabase` gav inga implementationsträffar för frånvaromodell eller frånvaro-UI.
- **Påverkan:** Admin kan inte registrera sjukdom, semester eller föräldraledighet i systemet, vilket gör coverage och efterföljande pulsbedömning beroende av manuella sidospår.
- **Förslag (1 mening):** Inför ett `cm_absences`-flöde med `CMAbsenceModal` direkt från Team-sidan och lagra typ, datum och eventuell ersättare strukturerat.
- **Prioritet (preliminär):** Must
- **Beroenden:** F-2.9

### F-6.5 — CM-pulsen kan inte ignorera röd status under aktiv frånvaro

- **Status:** ❌ saknas
- **Förväntat (källa):** `UI-BRAINSTORM-V3-FLOWS-OCH-OPERATIV-LOGIK.md:373` — status-pillar för kunder under frånvaro ska ignorera röd färgning eftersom CM-frånvaro inte ska räknas mot pulsen.
- **Faktiskt (kod-ref):** `app/src/lib/admin-derive/cm-pulse.ts:23-44` tar bara hänsyn till `bufferStatus !== 'paused'`, `last_interaction_days`, `n_under` och `n_thin`; ingen frånvaro- eller coverage-signal finns i inputen. `app/src/components/admin/CmPulseRow.tsx:12-28` och `app/src/components/admin/CmPulseHover.tsx:14-24` renderar sedan den statusen direkt.
- **Påverkan:** En CM som är legitimt frånvarande kan fortfarande visas som `Behöver åtgärd` eller `Bevaka`, vilket skapar falska eskaleringar och felaktig prestationsbild.
- **Förslag (1 mening):** Utöka pulsderiveringen med aktiv frånvaro/coverage och neutralisera eller suppressa röd status så länge perioden är markerad som frånvaro.
- **Prioritet (preliminär):** Must
- **Beroenden:** F-2.9
