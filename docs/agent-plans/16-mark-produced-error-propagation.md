# Plan 16 — Phase 9b: Mark-Produced Error Propagation

**Status**: Implementerad och typecheck-verifierad.
**Datum**: 2026-05-06
**Baserat på**: `docs/agent-plans/15-mark-produced-confirmation-flow.md`

---

## Problem

Phase 9a ändrade `MarkProducedDialog` till att köra reconcile → mark-produced i sekvens.
Men de callbacks som skickades in från `CustomerWorkspaceContent` svalde fel:

```typescript
// handleMarkProduced — svalde fel, alertade, kastade INTE vidare:
} catch (err) {
  console.error('Error marking as produced:', err);
  alert('Kunde inte markera som producerat');   // ← fel konsumeras här
}

// handleReconcileHistory — samma mönster
} catch (err) {
  console.error('Error reconciling history:', err);
  alert(err instanceof Error ? err.message : 'Kunde inte koppla historiken');
}
```

Det innebar att dialogens tvåstegslogik fick falsk success — `onReconcileHistory` kastade
aldrig, så dialogen stängde modalen och visade inte felmeddelandet. Användaren fick en
alert-popup och en stängd modal — varken tydlig feedback eller möjlighet att försöka igen.

---

## Lösning

Extrahera lågnivåfunktioner som kastar vid misslyckande, behåll alert-wrappers för
befintliga callers, skicka lågnivåfunktionerna till dialogen.

### Ny funktion: `markProducedRequest`

```typescript
const markProducedRequest = async (conceptId, tiktokUrl?, publishedAt?) => {
  const response = await fetch('/api/studio-v2/feed/mark-produced', { ... });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error ?? 'Kunde inte markera som producerat');
  }
  await fetchConcepts(true);
  setJustProducedConceptId(conceptId);
};
```

### Befintlig `handleMarkProduced` → alert-wrapper

```typescript
const handleMarkProduced = async (...) => {
  try {
    await markProducedRequest(...);
  } catch (err) {
    console.error('Error marking as produced:', err);
    alert(err instanceof Error ? err.message : 'Kunde inte markera som producerat');
  }
};
```

### Ny funktion: `reconcileHistoryRequest`

```typescript
const reconcileHistoryRequest = async (historyConceptId, options?) => {
  const response = await fetch('/api/studio-v2/history/reconciliation', { ... });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error ?? 'Kunde inte koppla historiken');
  }
  clearClientCache(conceptsCacheKey);
  await Promise.all([fetchConcepts(true), fetchCandidates()]);
};
```

### Befintlig `handleReconcileHistory` → alert-wrapper

```typescript
const handleReconcileHistory = async (...) => {
  try {
    await reconcileHistoryRequest(...);
  } catch (err) {
    console.error('Error reconciling history:', err);
    alert(err instanceof Error ? err.message : 'Kunde inte koppla historiken');
  }
};
```

### MarkProducedDialog — props uppdaterade

```typescript
// Före:
onMarkProduced={handleMarkProduced}
onReconcileHistory={handleReconcileHistory}

// Nu:
onMarkProduced={markProducedRequest}
onReconcileHistory={reconcileHistoryRequest}
```

---

## Resultat

| Scenario | Före Phase 9b | Efter Phase 9b |
|---|---|---|
| Reconcile misslyckas | Alert + modal stängs (falsk success) | Fel visas i dialogen, modal förblir öppen |
| Mark-produced misslyckas efter lyckad reconcile | Alert + modal stängs (kopplingen syns inte) | Specifik feltext: "Kopplingen är sparad..." modal öppen |
| FeedSlot/FeedPlanner callers | Alert-beteende (oförändrat) | Alert-beteende (oförändrat via wrapper) |

---

## Befintliga callers — inga ändringar behövs

`handleMarkProduced` och `handleReconcileHistory` (alert-wrappers) skickas fortfarande till:
- `FeedPlannerSection` → `FeedSlot` via `handleMarkProduced` / `handleReconcileHistory` props
- Ingen av dessa callers behöver kastande semantik — de förväntar sig fire-and-forget

Enda förändring i call-sites: `MarkProducedDialog` får nu request-funktionerna direkt.

---

## Inga ändringar i

- API-server
- `/admin/demos`
- `auto-reconcile.ts`
- `MarkProducedDialog.tsx` — dialogens felhanteringslogik är oförändrad sedan Phase 9a

---

## Teststatus

| Check | Resultat |
|---|---|
| `pnpm --filter @workspace/letrend exec tsc --noEmit` | ✅ 0 fel |
| `git diff --check HEAD~1..HEAD` | ⚠️ varnar om trailing whitespace i `attached_assets/Pasted-Du-jobbar-i-hagen-ui-Implementera-Phase-9a-korrekt-conf_1778092579963.txt` — plattforms-genererad fil, inbakad i föregående commit, inte redigerbar retroaktivt. Inga varningar i kod. |
| API-server orört | ✅ |
