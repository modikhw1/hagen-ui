### F-7.1 — “Kräver uppmärksamhet” saknar schemalagda CM-byten och pauser som ska återupptas idag

- **Status:** ❌ saknas
- **Förväntat (källa):** `AGENT-AUDIT-PLAYBOOK.md` §7 — listan ska innehålla minst `past_due`-fakturor, CMs med 0/låg aktivitet, schemalagda CM-byten idag och pauser som ska reaktiveras idag.
- **Faktiskt (kod-ref):** `app/src/lib/admin/overview-derive.ts:158-226` — attention-listan byggs bara från `cm_notifications`, obetalda fakturor, onboarding som fastnat, demos och blockerade kunder.
- **Påverkan:** Dagliga handovers och återstarter riskerar att missas i adminens morgonrutin.
- **Förslag (1 mening):** Lägg till attention-items för dagens schemalagda CM-byten och kunder vars paus löper ut idag.
- **Prioritet (preliminär):** Must
- **Beroenden:** F-2.1, F-2.3, F-2.9

### F-7.2 — CM med låg eller noll aktivitet lyfts inte in i prioriteringslistan

- **Status:** ⚠️ avvikelse
- **Förväntat (källa):** `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F6.3 — "0 CM aktivitet eller låg är också viktig"; `07-operativ-modell-och-koncept.md` anger "CM ser inaktiv ut" som en återkommande trigger att agera på.
- **Faktiskt (kod-ref):** `app/src/app/admin/page.tsx:55-100` — CM-aktivitet visas bara i den separata CM-pulssektionen; `app/src/lib/admin/overview-derive.ts:158-226` skapar inga attention-items från låg aktivitet.
- **Påverkan:** Kritiska CM-fall kräver att admin tolkar en separat pulslista i stället för att hamna i den explicita åtgärdskön.
- **Förslag (1 mening):** Lyft CMs som bryter aktivitetsreglerna till attention-listan som egna prioriterade items.
- **Prioritet (preliminär):** Must
- **Beroenden:** Inga

### F-7.3 — Prioriteringen saknar tydliga severity-nivåer och kan sortera mindre viktiga items före blockerade kunder

- **Status:** ⚠️ avvikelse
- **Förväntat (källa):** `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F6.2/F6.3 — overview ska prioritera efter bedömd severity av hur viktigt/aktuellt det är att hantera.
- **Faktiskt (kod-ref):** `app/src/lib/admin-derive/attention.ts:8-27` — sorteringen använder fast rank där `demo_responded` kommer före `customer_blocked` och inga explicita nivåer som akut/kan vänta/FYI exponeras.
- **Påverkan:** Operativt mindre kritiska poster kan ta plats före kund- eller leveransproblem som borde hanteras snabbare.
- **Förslag (1 mening):** Inför severity-klassning per attention-item och sortera primärt på denna i stället för en statisk typordning.
- **Prioritet (preliminär):** Should
- **Beroenden:** Inga

### F-7.4 — Klick på attention-item öppnar inte rätt sektion eller anchor i detaljvyn

- **Status:** ⚠️ avvikelse
- **Förväntat (källa):** `AGENT-AUDIT-PLAYBOOK.md` §7 — klick på item ska navigera till rätt detaljvy med rätt scroll/anchor.
- **Faktiskt (kod-ref):** `app/src/components/admin/AttentionList.tsx:125-130` — `hrefForItem` returnerar bara `/admin/customers/:id` eller `/admin/demos` utan hash, query eller sektion-specifik navigering.
- **Påverkan:** Admin landar på kundsidan men måste själv leta efter rätt faktura-, onboarding- eller blockeringssektion.
- **Förslag (1 mening):** Lägg till sektion-specifik navigering per attention-typ, exempelvis med hash eller query-parametrar som detaljvyn tolkar.
- **Prioritet (preliminär):** Should
- **Beroenden:** F-1.3

### F-7.5 — Det finns ingen “sedan senaste login”-markering eller läst-state

- **Status:** ❌ saknas
- **Förväntat (källa):** `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F6.2 — en "Vad du missat"-vy sedan senaste login efterfrågas; playbooken frågar explicit efter tidsstämpel eller markör per item.
- **Faktiskt (kod-ref):** `app/src/components/admin/AttentionList.tsx:168-180` — meta-informationen visar bara datum, belopp eller statisk text och använder ingen lagrad senaste-login-tid eller unread-markering.
- **Påverkan:** Admin kan inte skilja på nya händelser sedan senaste session och äldre poster som redan är kända.
- **Förslag (1 mening):** Spara senaste admin-login eller läst-state och märk nya attention-items relativt denna punkt.
- **Prioritet (preliminär):** Should
- **Beroenden:** F-2.10

### F-7.6 — Overview bygger bara attention från de 20 senaste öppna fakturorna

- **Status:** ⚠️ avvikelse
- **Förväntat (källa):** `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F6.3 — obetalda/förfallna fakturor ska prioriteras högt i overviewn; det förutsätter att underlaget är komplett.
- **Faktiskt (kod-ref):** `app/src/hooks/admin/useOverviewData.ts:66` hämtar bara `/api/admin/invoices?status=open&limit=20&page=1`, medan `app/src/app/api/admin/invoices/route.ts:60-72` sorterar på `created_at` och begränsar med `range(from, to)` för just den sidan.
- **Påverkan:** Äldre men fortfarande obetalda fakturor kan falla ur overviewns åtgärdslista helt, vilket gör severity-prioriteringen opålitlig redan i datakällan.
- **Förslag (1 mening):** Bygg attention-underlaget från alla relevanta obetalda fakturor eller från en separat serverquery för overdue-items i stället för första paginerade listan.
- **Prioritet (preliminär):** Must
- **Beroenden:** Inga
