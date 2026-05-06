# Phase 10b — Feed planner copy och död cue-kod städad

## Bakgrund

Efter Phase 8–10 sker planflytt via CM-bekräftelse (mark-produced-dialogens
`reconcile → mark-produced`-flöde), inte via cron/autopilot. Några kommentarer
och UI-strängar antydde fortfarande att ett automatiserat system (autopilot/cron)
hanterade planflytten. Phase 10b korrigerar detta utan att ändra beteende.

---

## Vad som ändrades

### `FeedPlannerSection.tsx`

**Auto-resolved nudge — kommentar (rad ~1122)**

| Förut | Nu |
|---|---|
| `cron advanced the plan automatically; informational only.` | `signal resolved after CM confirmation (mark-produced).` |

**Auto-resolved nudge — UI-text (rad ~1140)**

| Förut | Nu |
|---|---|
| `Autopilot hanterade X framflyttning(ar) automatiskt` | `Planen är uppdaterad och signalen hanterad` (singular) |
| | `Planen är uppdaterad och X signaler hanterade` (plural) |

Ändringar: borttagen autopilot-term, rättvisare pluralhantering (singular/plural
i stället för suffix `-ar`).

**Död cue-/granskningsläge-banner borttagen (~50 rader)**

Blocket `{false && focusedEvidenceIds.size > 0 && effectiveCue && (...)}` — ett
gammalt "Granskningsläge"-banner med deferred-state-knapp och stäng-×. Det var
gated bakom `false &&` och ersatt av den aktiva `FeedAdvanceCue`-komponenten
(Phase 9a–9c). Blocket renderades aldrig och orsakade ingen effekt, men
typ-checkades fortfarande i sin helhet. Borttagning minskar filen med ~50 rader.

### `CustomerWorkspaceContent.tsx`

**Rad ~602 — derived-variabel-kommentar**

| Förut | Nu |
|---|---|
| `auto-resolved nudges are informational (cron handled them)` | `auto-resolved nudges are resolved after mark-produced/planflytt` |

**Rad ~2509 — dismiss-funktion-kommentar**

| Förut | Nu |
|---|---|
| `Dismiss all auto-resolved motor signals (informational badge).` | `Dismiss auto-resolved motor signals (resolved after mark-produced/plan-advance).` |

---

## Auto-linking copy som medvetet BEHÖLLS

`FeedAdvanceCue.tsx` innehåller:
```
'Klipp automatiskt kopplat till nu-slotten'
'Vi kopplade automatiskt det nya klippet till nu-konceptet. Granska och bekräfta att det stämmer.'
```

Denna copy är **korrekt** — den beskriver att ett TikTok-klipp automatiskt
**kopplats** (länkats) till nu-slotten via reconciliation-algoritmen, inte att
planen automatiskt **förflyttats**. Semantiken är distinkt:

- Auto-**koppling** (auto-reconcile linking) → korrekt, sker automatiskt
- Auto-**planflytt** (advance plan) → sker **inte** automatiskt; kräver CM-bekräftelse

---

## Döda kodblockar som togs bort

| Block | Plats | Antal rader | Ersatt av |
|---|---|---|---|
| `{false && focusedEvidenceIds.size > 0 && effectiveCue && (...)}` — "Granskningsläge"-banner | `FeedPlannerSection.tsx` | ~50 | `FeedAdvanceCue` (aktiv komponent, Phase 9a) |

Eel-visualisering (`{false && eelSegments.length > 0 ? ...}`) lämnades kvar — den
är inte cue-/review-relaterad och har en separat utfasningshistorik.

---

## Teststatus

- `pnpm --filter @workspace/letrend exec tsc --noEmit` — **0 errors**
- `git diff --check HEAD` — **clean**
- API-server orörd.
- `/admin/demos` orörd.
