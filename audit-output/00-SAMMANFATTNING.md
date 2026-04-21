## Antal fynd per segment

- §1 Routing & navigation: ⚠️ 2, ❌ 2, 🚧 0
- §2 Datamodell vs. operativa krav: ⚠️ 2, ❌ 8, 🚧 0
- §3 Billing-floden: ⚠️ 3, ❌ 7, 🚧 0
- §4 CM-ekonomi och payroll: ⚠️ 2, ❌ 4, 🚧 0
- §5 Kund-lifecycle: ⚠️ 3, ❌ 2, 🚧 0
- §6 CM-vy & franvaro: ⚠️ 1, ❌ 4, 🚧 0
- §7 Overview & prioritering: ⚠️ 4, ❌ 2, 🚧 0
- §8 Sakerhet & destruktiva atgarder: ⚠️ 3, ❌ 3, 🚧 0
- §9 Onboarding (kund): ⚠️ 2, ❌ 0, 🚧 0
- §10 Cross-cutting: notifikationer, export, audit: ⚠️ 0, ❌ 5, 🚧 0

## Top-10 blockerare for dagligt operativt arbete

- 🔴 `F-2.3` - `cm_assignments` saknas, vilket blockerar korrekt historik, handovers och payroll-underlag.
- 🔴 `F-3.1` - mid-cycle prisandring kan inte delas upp i tva prisrader pa samma faktura.
- 🔴 `F-3.3` - kreditnota per fakturarad saknas helt i adminflodet.
- 🔴 `F-3.7` - pausflodet saknar `pause_until` och auto-reaktivering.
- 🔴 `F-3.8` - uppsagningsflodet saknar de tre operativa valen admin behover.
- 🔴 `F-3.10` - refund- och kreditnota-events saknas i webhookkedjan.
- 🔴 `F-4.1` - payroll-vy for manadsersattning per CM saknas.
- 🔴 `F-4.2` - CM-byte raknas inte pro-rata over billingperiod 25->25.
- 🔴 `F-5.2` - ateraktivering fran arkiv saknas trots att comeback-kunder ska ateranvanda historik och kopplingar.
- 🔴 `F-5.3` - skicka ny invite finns i API men saknas i admin-UI, vilket blockerar recovery av fastnade onboardingfall.

## Top-10 datamodell-grund som maste in forst

- 🟠 `F-2.1` - pausa pa subscription-spegeln med `pause_until`.
- 🟠 `F-2.2` - strukturerad `scheduled_price_change` pa subscription.
- 🟠 `F-2.3` - `cm_assignments` med giltighetsperioder.
- 🟠 `F-2.4` - `commission_rate` per CM/teammodell.
- 🟠 `F-2.5` - central `settings`-tabell for defaults.
- 🟠 `F-2.6` - korrekt tempofalt/default for kund (`expected_concepts_per_week` = 2).
- 🟠 `F-2.7` - admin-rollmodell med `super_admin` och `operations_admin`.
- 🟠 `F-2.8` - `audit_log` for destruktiva och ekonomiska actions.
- 🟠 `F-2.9` - `cm_temporary_coverage` for franvaro och coverage-perioder.
- 🟠 `F-2.10` - generell `events`-/notifications-strom for "vad du missat", retries och operativa signaler.
