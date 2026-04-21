# 07 – Operativ modell & centrala koncept

> **Källa:** `00_OPERATIONAL_MODEL.md` (uppladdad). Denna fil är **normativ** — om något annat dokument i planen säger emot, vinner denna.

---

## 1. Vem är admin, och vad ska översikten besvara

Admin driver LeTrend, har överblick över alla CMs och kunder. Vid 50+ kunder och 10–25 CMs är **överblick** det viktigaste. Admin lägger sig **inte** i det dagliga CM↔kund-arbetet, men måste se när något går fel innan det blir akut.

Morgonrutin (5 min på `/admin`) — admin ska inom 5 sekunder kunna svara på:

1. **Tjänar vi pengar?** → Månatliga intäkter + 30d-delta.
2. **Är någon CM i trubbel?** → CM-puls (sortbar).
3. **Är något akut?** → "Kräver uppmärksamhet"-listan.
4. **Bränner vi pengar?** → Kostnad 30d.

Översikten ska **sortera och peka**, inte svara på operativa frågor som hör hemma i Customers/Team/Billing.

---

## 2. Triggers att agera (sorterat efter frekvens)

1. Obetald faktura.
2. CM-notis till admin (saknas idag — ny tabell `cm_notifications`).
3. Onboarding fastnar (CM klar, kund inaktiv 7+ dagar).
4. CM ser inaktiv ut (låg interaktion + flera kunder med tunn buffer).
5. Demo-svar inkommit.

## 3. Triggers att INTE agera

- Kund som är planerat pausad.
- CM ledig (admin vet utanför systemet).
- Faktura som är **snoozad** inom snooze-fönstret.

→ Systemet **måste** tillåta admin att markera saker som hanteras utan att de försvinner permanent. Implementeras via tabellen `attention_snoozes` (se §8 i dokument 08).

---

## 4. Centrala koncept (datamodell-implikationer)

| Koncept | Definition | Datakälla |
|---|---|---|
| **Buffer** | Antal dagar framåt från idag som har koncept inladdat i kundens feedplan. | `feedplan_concepts.planned_publish_date` |
| **Tempo** | Antal koncept/vecka kunden kräver (1–5). | `customers.concepts_per_week` |
| **Interaktion** | Loggad CM-handling: login, feedplan-uppdatering, koncept tillagt, email skickat, not adderad, tiktok-uppladdning hämtad. | `cm_interactions` |
| **Blockering** | Kund har inte producerat enligt plan, oberoende av CM. | `tiktok_publications` |
| **Demo** | Prospect-flöde, separat från invite/onboarding. | `demos` |
| **Snooze / "hanteras"** | Admin markerar attention-post som under hantering. Försvinner från översikt, kvarstår som varning på detalj-sida. | `attention_snoozes` |

---

## 5. Designprinciper (skalning)

- Översikt ska fungera vid **50+ kunder och 25 CMs**. Listor måste sorteras och kapas (visa N + expandera).
- Per CM måste 5–10 kunder rymmas utan att svälla.
- Onboarding-status får inte bli bloat — visas där relevant, försvinner när inte längre.
- Inga metrics som "ser smarta ut" om admin inte agerar på dem.

---

## 6. Hur en bra CM värderas (helhetsbedömning)

Inte en enskild siffra. Helhet av:
- **Buffer per kund** (3–6 dagar framåt).
- **Interaktionsregelbundenhet**.
- **Onboarding-framgång** (nya kunder kommer igång).
- **Kundblockeringar** (signal, inte CM:ens fel).

Konkret implementation: se dokument 09 (CM-puls).
