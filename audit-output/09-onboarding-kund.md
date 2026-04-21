### F-9.1 - Forsta landningssidan visar generisk onboarding men ingen personlig game-plan

- **Status:** ⚠️ avvikelse
- **Forvantat (kalla):** `AGENT-AUDIT-PLAYBOOK.md` §9 / F8.1 - kundens forsta landing ska spegla CM, samarbetsupplagg, tidslinje och faktisk game-plan.
- **Faktiskt (kod-ref):** `app/src/app/welcome/page.tsx:145-175` visar `WelcomeHero`, `ContentManagerCard`, `ProcessTimeline`, `PackageSummary` och CTA, medan `app/src/app/api/onboarding/welcome-context/route.ts:11-17,120` bara levererar generiska process-steg. Samtidigt finns personlig game-plan-data redan i `app/src/app/api/customer/game-plan/route.ts:54` och renderas pa kundens feed i `app/src/components/customer/CustomerFeedShell.tsx:79-104,345-354`, men den anvands inte i `/welcome`.
- **Paverkan:** Forsta upplevelsen blir informativ men opersonlig; kunden ser processen i stort men inte sin faktiska plan eller sitt aktuella lage innan nasta steg.
- **Forslag (1 mening):** Ateranvand befintlig game-plan-payload pa `/welcome` och visa en kompakt planpreview eller nasta steg-widget innan checkout/utforskning.
- **Prioritet (preliminar):** Should
- **Beroenden:** Inga

### F-9.2 - Aterhamtningsflode for fastnad onboarding saknas i admin-UI trots att kundsidan hanterar fel

- **Status:** ⚠️ avvikelse
- **Forvantat (kalla):** `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F3.5 och `UI-BRAINSTORM-V3-FLOWS-OCH-OPERATIV-LOGIK.md` S-11 - admin ska kunna fa tillbaka kunder som fastnar, exempelvis genom ny invite/paminnelse.
- **Faktiskt (kod-ref):** `app/src/app/auth/callback/page.tsx:149-246` har explicita error-states for utgangen/ogiltig lank, men `app/src/components/admin/customers/CustomerDetailView.tsx:987-1010` visar bara generella atgarder och ingen resend/recover-action for kundinvite. `UI-BRAINSTORM-V3-FLOWS-OCH-OPERATIV-LOGIK.md:84` namner dessutom uttryckligen `ResendInviteModal`.
- **Paverkan:** Kundens problem syns nar lanken fallerar, men admin saknar ett direkt UI-verktyg for att aterstarta flodet fran adminpanelen.
- **Forslag (1 mening):** Koppla kundflodets fel- och expiry-scenarier till en tydlig resend/recover-action i kunddetaljen.
- **Prioritet (preliminar):** Must
- **Beroenden:** F-5.3
