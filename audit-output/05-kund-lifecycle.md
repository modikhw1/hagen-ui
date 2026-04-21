### F-5.1 — Kundstatus i UI täcker inte den operativa lifecycle-modellen

- **Status:** ⚠️ avvikelse
- **Förväntat (källa):** `AGENT-AUDIT-PLAYBOOK.md` §5 — statusfältet ska stödja `invited`, `pending_payment`, `active`, `paused`, `past_due`, `cancelled`, `archived`.
- **Faktiskt (kod-ref):** `app/src/lib/admin/labels.ts:1-15` — admin-UI etiketterar bara `active/agreed`, `invited`, `pending` och `archived`; `pending_payment`, `paused`, `past_due` och `cancelled` får ingen dedikerad presentation i kundlistan.
- **Påverkan:** Admin kan inte se kundens faktiska lifecycle-state snabbt nog för att fatta rätt operativ åtgärd.
- **Förslag (1 mening):** Utöka statuspresentationen så att alla definierade lifecycle-states får egna labels och badge-färger.
- **Prioritet (preliminär):** Must
- **Beroenden:** F-2.1

### F-5.2 — Återaktivering från arkiv saknas i adminflödet

- **Status:** ❌ saknas
- **Förväntat (källa):** `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F3.2 — avhoppad kund ska återaktiveras på gamla kontot och behålla historik, TikTok-koppling och slug; F3.5 nämner också behovet av återställ-från-arkiv.
- **Faktiskt (kod-ref):** `app/src/components/admin/customers/SubscriptionActions.tsx:104-110` och `app/src/app/admin/customers/page.tsx:15-20` — admin kan filtrera fram arkiverade kunder och arkivera nya, men det finns ingen återställ-/reaktivera-action i kunddetaljen eller listvyn.
- **Påverkan:** Comeback-kunder måste hanteras manuellt utanför det avsedda adminflödet trots att historiken ska återanvändas.
- **Förslag (1 mening):** Lägg till ett reaktiveringsflöde som återställer kundstatus och startar om abonnemanget på befintlig profil.
- **Prioritet (preliminär):** Must
- **Beroenden:** F-2.1

### F-5.3 — Skicka ny invite stöds i API men saknas i admin-UI

- **Status:** ⚠️ avvikelse
- **Förväntat (källa):** `OPERATIV-FLODESBEDOMNING-IFYLLD.md` F3.5 — "Att kunna skicka ut en ny invite är bra, ifall det buggar med registrering eller länk går ut."
- **Faktiskt (kod-ref):** `app/src/app/api/admin/customers/[id]/route.ts:208-429` — backend har `send_invite`-action, men `app/src/components/admin/customers/CustomerDetailView.tsx:987-1010` visar inga knappar för att skicka ny invite eller påminnelse.
- **Påverkan:** Fastnade kunder kan inte hämtas tillbaka från adminpanelen trots att stödet finns på servernivå.
- **Förslag (1 mening):** Exponera `send_invite` som knapp i kunddetaljen för `invited` och relaterade onboarding-states.
- **Prioritet (preliminär):** Must
- **Beroenden:** Inga

### F-5.4 — Kundlistans onboarding-signaler följer inte 7-dagarsregeln eller "Ny till settled"

- **Status:** ⚠️ avvikelse
- **Förväntat (källa):** `09-grafik-och-berakningslogik.md:377-381` — customer-listan ska visa liten `Ny`-pill fram till `settled`, och "kräver uppmärksamhet" ska triggas **endast** om `cm_ready >= 7d` utan `live`.
- **Faktiskt (kod-ref):** `app/src/app/admin/customers/page.tsx:96`, `app/src/app/admin/customers/page.tsx:232-235` och `app/src/app/admin/customers/page.tsx:324-334` — `Ny` visas bara för `invited|cm_ready` (inte `live`), och `cm_ready` får varningston direkt utan kontroll av hur länge kunden varit i det läget.
- **Påverkan:** Färska onboardingfall kan flaggas för tidigt samtidigt som nya live-kunder tappar `Ny` för tidigt, vilket gör listsignalen brusigare än den avsedda modellen.
- **Förslag (1 mening):** Låt `Ny` leva till `settled` och deriviera separat försening/attention från `onboarding_state_changed_at` eller motsvarande så att bara `cm_ready >= 7d` markeras.
- **Prioritet (preliminär):** Should
- **Beroenden:** Inga

### F-5.5 — Byte av primär e-post synkas inte vidare till Stripe customer

- **Status:** ❌ saknas
- **Förväntat (källa):** `AGENT-AUDIT-PLAYBOOK.md` §5 — primär e-post ska kunna bytas och synkas till Stripe customer email.
- **Faktiskt (kod-ref):** `app/src/components/admin/customers/ContactEditForm.tsx:22-45` och `app/src/app/api/admin/customers/[id]/route.ts:493-634` — kontaktformuläret sparar `contact_email` i `customer_profiles`, men PATCH-flödet uppdaterar inte motsvarande Stripe customer.
- **Påverkan:** Fakturamottagare och kundkommunikation kan divergera mellan LeTrend-admin och Stripe.
- **Förslag (1 mening):** Synka uppdaterad `contact_email` till Stripe när kunden har `stripe_customer_id`.
- **Prioritet (preliminär):** Must
- **Beroenden:** Inga
