# Phase 11c — FeedPlanner Live UI QA Results

**Datum:** 2026-05-06  
**Kund:** Pot. kund 28 / @blubnan.liljeholm (`bcbbdb19-8e12-4e74-8c51-7797cab157a6`)  
**Testad av:** Mahmoud (manuellt) + Playwright-försök (delvis)

---

## Pre-test snapshot

| Fält | Värde |
|---|---|
| Motor signal | `f28f37a4` — nudge/fresh_activity, imported=10, latest=2026-05-04T18:22:37Z, auto_resolved=null |
| Nu-slot | `7cd70730` — fo=0, ingen published_at, ingen reconciliation |
| +1-slot | `d1d5f235` — fo=1 |
| +2-slot | `49d65d74` — fo=2 |
| Senaste history-klipp | `0d391af9` — pub 2026-05-04T18:22:37, 1 305 visningar |
| Unreconcilade history-rader | 10 st (fo=null, reconciled_customer_concept_id=null) |

---

## Testutfall

### Playwright-test (automatiserat)
- **Status:** `failure` — 401 Unauthorized på `GET /api/me` under auth-redirect
- Trots 401:an tycks ett delvis API-anrop ha gått igenom (plan avancerade ett steg)
- **Orsak:** Magic link redirect låst till `app.letrend.se` (Supabase config), kräver temp-lösenord för lokal test-login

### Manuellt test (Mahmoud i browser)
- **Login:** `dev@letrend.se` med temp-lösenord (satt via Supabase admin-API)
- **Navigation:** `/studio/customers/bcbbdb19...?section=feed`
- **FeedAdvanceCue visades:** ✓ — grön banner "10 nya klipp i historiken"
- **"Bekräfta som gjord" klickades:** ✓
- **Dialog öppnades:** ✓ — "Markera som gjord", auto-mode förvalt
- **"Bekräfta" klickades:** ✓
- **Auto-resolved banner visades:** ✓ — "Planen är uppdaterad och signalen hanterad"

---

## Post-test DB-snapshot

| Fält | Värde | Förväntat | OK? |
|---|---|---|---|
| Motor signal `f28f37a4` auto_resolved_at | `2026-05-06T21:39:08Z` | Satt | ✓ |
| Klipp `0d391af9` reconciled_customer_concept_id | `7cd70730` | Länkat till ursprunglig nu-slot | ✓ |
| Ursprunglig nu-slot `7cd70730` feed_order | `-2` | `-1` | ✗ (dubbelsteg) |
| `d1d5f235` feed_order | `-1` | `0` (ny nu) | ✗ (dubbelsteg) |
| `49d65d74` feed_order | `0` (ny nu) | `1` | ✗ (dubbelsteg) |

**Avvikelse:** Planen avancerade **två steg** istället för ett. Trolig orsak: Playwright-testets partiella anrop + manuell bekräftelse körde mark-produced två gånger. Reconcilingen i sig är korrekt.

---

## BUG-1 (bekräftad från Phase 11b) — ingen auto_resolved via cron

- Ingen auto_resolved-signal observerad via cron-vägen under testperioden
- Signalen `f28f37a4` resolv:ades manuellt (CM-action), inte automatiskt
- Cron-vägen för auto-reconciliation är otestad i live-miljö
- **Nästa test:** Ny profil med faktiskt uppladdade klipp, invänta cron-körning

---

## Observationer och designdiskussion

### Grundförutsättningen matchar inte idealscenario
Alla 10 klipp var redan importerade i historiken när testet kördes — signalen hade generats för dagar sedan. Det "nya" klippet (0d391af9, pub 2026-05-04) var det senaste, valt via seam-filter (published_at ≥ signal.latest_published_at). Tekniskt korrekt beteende, men UI:t kommunicerar inte att klippen är "gamla nyheter".

### Dialog-framing kan förbättras
Nuvarande tre alternativ:
1. "Kunden filmade rätt koncept" (auto) → kopplar senaste klipp till nu-slot ✓
2. "Kunden filmade ett annat koncept" (manual) → väljer klipp men kopplar ändå till nu-slot ✗ (borde kunna välja *vilken slot*)
3. "Hoppa över" → avancerar utan koppling ✓

Alternativ 2 bör kunna länka klipp till en annan planerad slot (inte bara nu), för fallet där kunden filmade ett kommande koncept snarare än nu-konceptet.

### Helg-scenario (cron-paus)
Om tre klipp laddas in fre/lör/sön utan cron-körning: CM ser "N nya klipp" och bekräftar manuellt — ett klipp per nu-slot per "Bekräfta"-klick. Alternativt: cron kan konfigureras att köra helger (inget tekniskt hinder).

### Cron-vägen är den primära (CM-vägen är genväg)
Det manuella flödet är en genväg för CM:ar som råkar vara inne och vill bekräfta direkt. Cron sköter auto-reconciliation (0–4h fördröjning) utan CM-inblandning om score ≥ tröskel.

---

## Nästa steg

1. **Testa cron-auto-reconciliation:** Ny profil, ladda in ett klipp, invänta cron — verifiera att `auto_resolved_at` sätts utan CM-åtgärd
2. **Fixa dubbelsteg-risken:** Bättre idempotens-skydd i mark-produced (ignorera om nu-slotten redan är gjord)
3. **Dialog alternativ 2:** Gör det möjligt att länka ett klipp till en annan planerad slot, inte bara nu
4. **Kommunikation i UI:** Visa tydligare hur gammalt klippet är relativt signalens datum (seam-ålder)
