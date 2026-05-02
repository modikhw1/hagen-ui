# Slice 2.1 History Toggle — Manuell testchecklista (staging/prod)

Datum: 2026-04-13
Scope: history-toggle UX, now-slot default, reversibilitet

Förutsättning: Logga in som CM. Navigera till en kund som har:
- minst ett importerat TikTok-klipp i historiken (row_kind = imported_history)
- minst ett aktivt LeTrend-koncept i nu-slot (feed_order = 0)

---

## 1. History card labels är borta

- [ ] Öppna feedplanen för kunden och scrolla till historiken.
- [ ] Bekräfta att inget history-kort visar texten "LeTrend-producerad", "LeTrend-kopplad" eller "TikTok" som ett stående badge/label på kortet.
- [ ] Om ett klipp är reconciled: bekräfta att det enda som visas extra är koncepttiteln med ett litet "LeTrend:"-prefix — inte en fristående statussymbol.

---

## 2. Imported history visar `Markera som LeTrend`

- [ ] Högerklicka (eller öppna context-menu) på ett **oreconcilerat** importerat TikTok-klipp.
- [ ] Bekräfta att knappen "Markera som LeTrend" finns och är klickbar.
- [ ] Bekräfta att "Markera som LeTrend" är den **första** history-specifika handlingsknappen i menyn (före "Välj LeTrend-koncept...").

---

## 3. Om item redan är reconciled visas `Markera som TikTok`

- [ ] Öppna context-menu på ett klipp som **redan är reconcilerat** (har "LeTrend:"-prefix på kortet).
- [ ] Bekräfta att knappen nu lyder "Markera som TikTok" — inte "Markera som LeTrend".

---

## 4. `Markera som LeTrend` använder now-slot när sådan finns

- [ ] Se till att kunden har ett aktivt nu-koncept i nu-slot (feed_order = 0).
- [ ] Klicka "Markera som LeTrend" på ett oreconcilerat importerat klipp.
- [ ] Bekräfta att ingen picker öppnas — reconciliation sker direkt.
- [ ] Bekräfta att "LeTrend:"-prefix nu visas på kortet med nu-slottets koncepttitel.
- [ ] Bekräfta att knappen i menyn nu lyder "Markera som TikTok".

---

## 5. Fallback `Välj LeTrend-koncept...` fungerar

**5a — CM väljer att avvika från nu-slot:**
- [ ] Öppna context-menu på ett oreconcilerat klipp (kund har nu-slot).
- [ ] Klicka "Välj LeTrend-koncept..." (den sekundära knappen).
- [ ] Bekräfta att en dropdown öppnas med tillgängliga LeTrend-koncept.
- [ ] Bekräfta att panelen visar text om att nu-slot är normalt default.
- [ ] Välj ett annat koncept ur listan och klicka "Spara koppling".
- [ ] Bekräfta att "LeTrend:"-prefix på kortet visar det valda konceptets titel (inte nu-slottets).

**5b — Kund saknar nu-slot:**
- [ ] Använd en kund utan aktivt nu-slot-koncept (feed_order = 0).
- [ ] Klicka "Markera som LeTrend" direkt.
- [ ] Bekräfta att pickern öppnas automatiskt (ingen tyst felhantering).
- [ ] Bekräfta att panelen visar "Inget aktivt nu-slot-koncept hittades."
- [ ] Välj ett koncept manuellt och spara — bekräfta att reconciliation lyckas.

---

## 6. `Markera som TikTok` återställer korrekt

- [ ] På ett reconcilerat klipp: klicka "Markera som TikTok".
- [ ] Bekräfta att "LeTrend:"-prefix försvinner från kortet.
- [ ] Bekräfta att knappen åter lyder "Markera som LeTrend".
- [ ] Bekräfta att klippets TikTok-data (thumbnail, views, likes) är oförändrad.
- [ ] Bekräfta att nu-slottets LeTrend-koncept **inte** påverkats (öppna det konceptet och kontrollera att det ser normalt ut).

---

## 7. Ingen semantisk regression mellan cron / advance-plan / mark-produced

- [ ] Markera nu-slottets koncept som producerat via "Markera som gjord".
- [ ] Bekräfta att feedplanen skiftar: nästa kommande-koncept blir nytt nu.
- [ ] Bekräfta att importerade TikTok-klipp i historiken **inte** påverkats av skiftet (deras reconciliation-status är oförändrad).
- [ ] Om cron-import körs: bekräfta att nya importerade klipp hamnar i historiken som oreconcilierade — de tilldelas **inte** automatiskt till något LeTrend-koncept.

---

## Godkänd när

Alla checkboxar ovan är ikryssade utan oväntade fel eller avvikelser.
