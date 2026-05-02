# Active Task

## Title
Reframe Studio around the content manager creative workflow

## Why this task exists
The user wants to explain and reshape the content-manager/studio experience in `hagen-ui`. The current implementation already contains studio functionality, but the present flow likely does not match the intended product model.

## Current focus
Define the intended Studio model for content managers before implementation work:
- what Studio is for
- which objects/workflows are primary
- what belongs to Studio vs Admin
- how concept discovery, assignment, customer communication, and customer-facing data should fit together
- how external data from `hagen-main` / the real database should flow into `hagen-ui`
- how imported TikTok collections and lightweight CM categorization should enter the workflow

## In-scope areas
- `/studio/*`
- content manager workflow and role boundaries
- customer workspace information architecture
- concept library behavior and sourcing
- relationship between Studio, Admin, and customer-facing surfaces
- external data dependencies from `hagen-main`
- distinction between base concepts and customer-adapted concept instances
- future fit for automated/data-driven assistance without overdesigning the present UI

## Confirmed current-system anchors
- `/studio` redirects to `/studio/customers`
- Studio is accessible to `admin` and `content_manager`
- Studio shell currently exposes: customers, concepts, upload, invoices
- Customer workspace sections currently include: gameplan, koncept, feed, kommunikation, demo
- Studio includes both customer-workflow tooling and some admin-adjacent functions
- Studio concept library currently loads from local JSON via `conceptLoader` in `app/src/app/studio/concepts/page.tsx`
- There is also a DB-backed concept loader (`conceptLoaderDB`), but the studio concepts page is not using it
- Upload currently calls `hagen-main` APIs for video upload/analysis, then persists concept data through this app

## Refined intended Studio model
Studio should operate as a CM-first creative suite, not a mixed admin workspace.

### CM opening-state / entry workflow
When a CM opens Studio, the first-value actions should likely center on:
- quickly importing new inspiration/concepts from TikTok (for example a saved collection)
- reviewing newly imported clips in a lightweight intake flow
- doing fast personal categorization / triage
- deciding which clips are worth deeper analysis or assignment to customers

### Stepper / intake concept
A prior concept called `stepper` is important to preserve as a product idea:
- ingest a TikTok collection URL
- fetch thumbnails and lightweight metadata for many clips at once
- let the CM quickly filter/categorize them for personal workflow use
- avoid forcing immediate expensive analysis on every imported clip
- avoid forcing manual one-link-at-a-time entry into the library

### CM weekly operating model
The CM is expected to:
- bring in clips/concepts regularly (example: ~15 saved clips per week)
- choose a smaller set of customer-relevant concepts (example: ~3 concepts per week per customer cadence)
- analyze selected clips with the video analysis tools
- update notes and game plan
- place/adapt concepts in the feed planner
- comment on or give feedback on customer-uploaded content
- communicate strategy and expectations clearly to the customer

### Primary product objects
The user model implies at least these distinct layers:
1. raw/imported clips or references (pre-analysis, often personal intake)
2. base concepts (video + extracted metadata)
3. customer-adapted concept instances (modified script, customer-specific framing, filming guidance, etc)
4. feed/timeline placements that sync toward the customer experience
5. notes / feedback / communication artifacts around the above

### Customer-facing enhancement layer
The value is not to over-explain what is already visually obvious in the clip, but to enhance customer understanding through metadata such as:
- concept title
- why it fits this customer
- what the customer should think about while filming
- customer-specific script/instructions
- expectations and strategic framing

### Editing / production implication
The suite is not only an editing workspace. It may also need to support structured production data for LeTrend's mobile recording/editing flow, such as:
- predefined scenes
- script per scene
- scene duration
- other structured instructions enabling downstream automatic or simplified editing

### Concept-library philosophy
The concept library should not primarily be a huge collaborative archive.
It should likely be:
- personal / CM-owned intake and working inventory first
- customer assignment and adaptation second
- small shared/global reusable layer third

### Strategic UX direction
Studio should help the CM move from:
TikTok discovery/import -> lightweight triage -> selective analysis -> customer adaptation -> feed placement -> customer communication/feedback

## Immediate goal
Produce a clear current-system / intended-system / gap-model framing for Studio as a CM-first creative suite, with special attention to intake/import, concept adaptation, and the boundary between CM-private work and customer-visible outputs.

## Open product questions
- Should Studio home be a hybrid overview or an intake-first dashboard?
- Which imported clips become analyzed/base concepts, and when?
- What exact objects belong in `hagen-main` versus `hagen-ui`?
- How should CM-private triage differ from customer-visible planned concepts?
- How should customer-uploaded feedback/review loops fit into the same suite?
