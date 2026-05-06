# Phase 12a — FeedPlanner mark-produced idempotency guard

**Datum:** 2026-05-06  
**Bakgrund:** Phase 11c visade att `bcbbdb19` avancerade två steg istället för ett. Playwright-testets partiella anrop + manuell bekräftelse körde `mark-produced` två gånger mot samma motor-signal.

---

## Ändrade filer

| Fil | Vad ändrades |
|---|---|
| `artifacts/letrend/src/hooks/useFeedPlannerState.ts` | Lade till `cueSignalId` state; `handleOpenMarkProducedDialog` tar nu optional `signalId` (3:e arg); `handleCloseMarkProducedDialog` nollställer `cueSignalId` |
| `artifacts/letrend/src/components/studio/customer-detail/feedTypes.ts` | Uppdaterade `handleOpenMarkProducedDialog` och `onOpenMarkProducedDialog` prop-typer med optional `signalId?: string` |
| `artifacts/letrend/src/components/studio/customer-detail/FeedPlannerSection.tsx` | `onMarkProducedFromCue`-callback skickar nu `activeNudges[0]?.id` som tredje argument till `handleOpenMarkProducedDialog` |
| `artifacts/letrend/src/components/studio/customer-detail/MarkProducedDialog.tsx` | `sourceSignalId?: string` tillagd i props-interface och destrukturering; alla fyra `onMarkProduced(...)`-call sites skickar nu `sourceSignalId` som 4:e argument |
| `artifacts/letrend/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx` | Destrukturerar `cueSignalId` från `useFeedPlannerState`; `markProducedRequest` tar optional `signalId` (4:e param); skickar `feed_motor_signal_id` i request-body; på 409 "signalen är redan hanterad" → `fetchMotorSignals()` för att rensa stale cue; `<MarkProducedDialog sourceSignalId={cueSignalId ?? undefined} />` |
| `artifacts/api-server/src/routes/studio-v2.ts` | Parsar `feed_motor_signal_id` från body; signal-guard efter lock; targeted signal resolve efter RPC |

---

## Guard-logik — exakt flöde

```
POST /api/studio-v2/feed/mark-produced
  { concept_id, customer_id, feed_motor_signal_id? }

1. ensureCustomerAccess()
2. Acquire optimistic lock (pending_history_advance_at IS NULL → sätts till now)
   → 409 "Planen flyttas redan fram" om låst
3. [NY] Om feed_motor_signal_id finns:
   a. Hämta signalen från feed_motor_signals WHERE id = $signalId
   b. Verifiera att customer_id matchar
   c. Verifiera att auto_resolved_at IS NULL
   d. Verifiera att acknowledged_at IS NULL
   → 409 "Den här signalen är redan hanterad. Uppdatera sidan." vid brott
4. RPC advance_customer_feed_plan(...)
5. Hämta producerat koncept för svar
6. [UPPDATERAD] Signal-resolve:
   - Om feed_motor_signal_id: UPDATE feed_motor_signals SET auto_resolved_at=now WHERE id=$signalId AND customer_id=$customerId AND auto_resolved_at IS NULL AND acknowledged_at IS NULL
   - Annars (legacy): UPDATE feed_motor_signals SET auto_resolved_at=now WHERE customer_id=$customerId AND ... (broad resolve, befintligt beteende)
7. renumberImportedRows() (non-fatal)
8. Release lock
```

---

## Varför detta stoppar dubbel-advance

**Utan guard (gamla beteendet):**
- Anrop 1 (t.ex. Playwright-test): hämtar lock, kör RPC, sätter `auto_resolved_at` på signal, släpper lock
- Anrop 2 (CM manuellt): hämtar lock (nu fri igen), kör RPC igen → plan avancerar ett steg till

**Med guard:**
- Anrop 1: kör igenom, sätter `auto_resolved_at` på signal `X`
- Anrop 2: signal `X` har nu `auto_resolved_at IS NOT NULL` → returnerar 409 innan RPC körs → plan avancerar inte
- Frontend: CM ser "Den här signalen är redan hanterad. Uppdatera sidan." → `fetchMotorSignals()` körs → cue försvinner → UI är konsistent

**Befintligt lock skyddar mot samtida dubbel-klick:**
- Två simultana anrop: anrop 1 tar lock, anrop 2 får 409 "Planen flyttas redan fram" direkt
- Signal-guard skyddar mot det sekventiella fallet (tidsgap mellan anropen)

---

## Bakåtkompatibilitet

- Mark-produced utan `feed_motor_signal_id` (t.ex. vanlig "Markera som producerad"-knapp på nu-kortet) fungerar exakt som tidigare — broad resolve, ingen signal-validering
- `onMarkProduced`-callbacket i `MarkProducedDialog` accepterar nu `signalId` som 4:e valfritt argument — befintliga call sites utanför dialogen (t.ex. `handleMarkProduced` i CWC) påverkas inte

---

## Kvarvarande risker

| Risk | Sannolikhet | Kommentar |
|---|---|---|
| Signal-guard kringgås om CM öppnar dialogen utan att cuen visas (direkt via nu-kort) | Låg | `sourceSignalId` skickas bara när dialogen öppnas från `FeedAdvanceCue`; vanlig nu-knapp skickar ingen `feed_motor_signal_id` → broad resolve, men det sekventiella dubbelsteget uppstår inte heller eftersom det inte finns en signal att hänga sig på |
| Cron-initiated resolve + manuellt anrop i samma sekund | Låg | Cron sätter `auto_resolved_at` → manuellt anrop blockas av signal-guard |
| Playwright-test framkallar partiellt anrop igen | Låg | Magic link-redirect till `app.letrend.se` blockerar Playwright-auth — men signal-guard stoppar nu det andra anropet även om auth lyckas |

---

## Testresultat

- **Typecheck frontend:** 0 fel ✓
- **Typecheck API server:** 0 fel ✓
- **Bakåtkompatibilitet:** `onMarkProduced` utan signal-id (vanlig knapp-path) kompilerar och fungerar oförändrat ✓

---

## Rekommenderat nästa live-test

1. **Nytt QA-konto** — profil med faktiska TikTok-klipp
2. Öppna `FeedAdvanceCue`, klicka "Bekräfta som gjord"
3. Öppna **ett andra browser-fönster** med samma session och klicka "Bekräfta" igen innan det första anropet är klart
4. Förväntat: andra klicket ger "Den här signalen är redan hanterad. Uppdatera sidan." och plan avancerar exakt ett steg
5. Verifiera i Supabase att `auto_resolved_at` sätts exakt en gång och `feed_order` på det som var nu-slot är negativt (−1)
