# 06: Oppna affarslogikfragor

Detta ar de fragor som paverkar arkitekturval. De bor besvaras innan en agent bygger planmotor, TikTok matching eller nytt ingestkontrakt.

## Blockerande beslut

### 1. Vad ska handa nar exakt ett nytt TikTok-klipp hittas?

Nuvarande kod auto-lankar historik till current LeTrend-rekommendation om exakt ett nytt klipp importerats, men flyttar inte planen.

Beslutsalternativ:

- A: Bara skapa review/nudge. CM maste godkanna match och flytta plan.
- B: Auto-lanka bevis till current, men CM maste klicka "markera som producerad" for att flytta plan.
- C: Auto-lanka och auto-advance:a planen direkt om confidence ar hog.

Teknisk konsekvens:

- A/B ar sakrare och enklare att forklara.
- C kraver idempotent planmotor, scoring, rollback/undo och bra audit trail.

### 2. Far CM flytta planen utan TikTok-bevis?

Idag finns mark-produced med optional TikTok URL.

Beslutsalternativ:

- A: Ja, CM kan markera producerad manuellt utan TikTok-bevis.
- B: Ja, men UI markerar raden som "producerad utan verifiering".
- C: Nej, kräv TikTok URL eller länkad historik.

Rekommendation: B. Det ger praktisk flexibilitet utan att lura systemet om datakvalitet.

### 3. Ska imported TikTok history bo i `customer_concepts`?

Nuvarande implementation lagrar importerad TikTok-historik i `customer_concepts`.

Beslutsalternativ:

- A: Behall i `customer_concepts`, men lagg explicit `row_kind`.
- B: Flytta till egen `customer_tiktok_history`/`tiktok_videos`-modell och lat `customer_concepts` bara innehalla plan/rekommendationer.
- C: Hybrid: raw TikTok i egna tabeller, projection/cache i `customer_concepts`.

Rekommendation: C pa sikt. A ar rimlig kortsiktigt for att inte bryta allt.

### 4. Vad ar ett collaboration-objekt?

Nuvarande collaboration ar `customer_concepts` med `concept_id=null` och `visual_variant='collaboration'`.

Beslutsalternativ:

- A: Collaboration ar en first-class `customer_concepts.row_kind='collaboration'`.
- B: Collaboration ska vara egen tabell och bara projiceras in i feed planner.
- C: Collaboration maste alltid ha ett globalt `concepts`-objekt.

Rekommendation: A kortsiktigt. B kan bli battre om collaboration far helt egen livscykel, pris, partnerstatus och avtal.

### 5. Vilka Hagen-metadatafalt ar affarskritiska?

Du har beskrivit att mer metadata ger mer filterability och utility, men appen behover veta vilka falt som faktiskt driver vardet.

Foreslaget minimum for Feed Planner och kundnytta:

- format type
- hook type/text
- topic/category
- primary tone
- humor mechanism/type
- people count
- scene count
- duration
- editing style
- camera style
- CTA presence/type
- replicability score
- required resources
- suggested customer adaptation

Fragor:

- Ska planner kunna filtrera pa alla dessa?
- Vilka ska visas customer-facing?
- Vilka ska bara vara interna CM-signaler?
- Vilka ska kunna overridas manuellt?

### 6. Nar i demo/customer creation ska ingest starta?

Du foreslog att ingest kan starta i samband med "skapa demo" nar kunden skapas.

Beslutsalternativ:

- A: Demo-create startar alltid initial TikTok profile fetch.
- B: Demo-create startar fetch bara om TikTok handle finns.
- C: Demo-create skapar kund och lagger ingest i ko, men preview blir tillganglig med "pending data".

Rekommendation: B + tydlig progress. Om handle saknas ska UI saga vad som saknas.

### 7. Hur ska CRM-forward flow fungera?

Du noterade att nuvarande CRM-flode har win/lost men saknar knapp som faktiskt flyttar lead fram i flodet.

Behover beslutas:

- Vilka stages ar canonical?
- Vilken action flyttar `sent -> dialogue -> offer -> won/lost`?
- Ska demo-create och customer invite vara stages i samma pipeline eller separata objekt?
- Ska CM-ansvarig och sales-ansvarig vara samma roll eller separata?

### 8. Vem far vara demo-CM?

Nuvarande demo-dropdown verkar bygga pa `team_members`, medan behorigheter finns i `profiles`/roles.

Beslutsalternativ:

- A: Endast `team_members` ar valbara, men alla admin/CM-profiler maste syncas dit.
- B: Alla `profiles` med admin/content_manager roll ar valbara.
- C: Separat `cm_assignments`/team registry ar sanningen.

Rekommendation: B kortsiktigt for att undvika "ingen CM" nar anvandaren faktiskt har behorighet. C pa sikt om team-management ska ha mer metadata.

## Minsta svar som racker for nasta implementation

For att komma vidare utan att blockera allt behover en agent minst dessa beslut:

1. Auto-reconcile ska vara A, B eller C?
2. Mark-produced utan TikTok-bevis ska vara A, B eller C?
3. Imported history ska kortsiktigt vara A, B eller C?
4. Ska demo-create alltid trigga TikTok fetch nar handle finns?
5. Vilka 8-12 Hagen metadatafalt ar obligatoriska for v1?
