# Operativ flödesbedömning — frågor till admin

**Syfte:** Detta dokument samlar alla frågor där agenten behöver din **operativa bedömning som admin** för att bygga rätt flöden. Det är inte tekniska val (databasstruktur, kod-arkitektur) och inte UI-detaljer (hover, färger). Det är frågor om **hur verksamheten ska fungera i praktiken** — där det finns en spänning mellan din magkänsla, branschpraxis (SaaS), och vad som faktiskt går att operationalisera när du sitter ensam med 30+ kunder.

**Hur du svarar:**
Markera ditt val per fråga (A/B/C/D) eller skriv eget svar. Lägg gärna till en mening om *varför* om det är ett gränsfall — det hjälper agenten att extrapolera till liknande beslut den möter senare.

**Format per fråga:**
- **Kontext:** Vad situationen handlar om i din vardag.
- **Alternativ:** 2-4 operativa modeller, med konsekvens.
- **Min rekommendation:** Var jag landar om du inte har en stark åsikt.

---

## TEMA 1 — Pengar in: prisändringar, rabatter, kreditering

### F1.1 — Mid-cycle prisändring (kund vill ändra pris den 14:e i månaden)

**Kontext:** Kund på 5 000 kr/mån vill byta till 8 000 kr/mån, eller tvärtom. Stripe stödjer pro-rata automatiskt, men frågan är: vad förväntar du dig att kunden faktiskt ska se på sin nästa faktura, och hur kommunicerar du det?

- **A) Pro-rata direkt, ny faktura nu** — Kunden får en mellanfaktura på diff för resterande dagar inom 1-2 dagar. Tydligt men "extra" faktura kan förvirra.
- **B) Pro-rata adderas på nästa ordinarie faktura** — Inget extra utskick, men nästa faktura blir "konstig" (5 233 kr istället för 5 000 eller 8 000).
- **C) Ny prisnivå börjar nästa period, nuvarande månad oförändrad** — Inget pro-rata. Enklast att förklara, men du "förlorar" eller "ger bort" diff.
- **D) Du väljer per kund i UI varje gång** — Mer arbete men full kontroll.

**Min rekommendation:** C som default, A som val i modalen för uppgraderingar (då vill kunden ofta börja direkt).

**Ditt svar:** Det rimliga för mig är att automatiskt skapa två rader, där perioden som avses (säg 25 mars - 25 april) delas upp till
två rader där den ena är priset (säg 5000) för en range, t.ex. 25 mars - 6 mars, med en kalkyl på priset på den raden. För
andra raden är kalkylen för andra uträkningen. Med andra ord delas fakturan upp i två rader med olika priser. Det är ok att kostnaden
är assymetrisk. 'Men' det borde också finnas möjlighet att säga "byt pris när månaden är slut", dvs att nuvarande priset är kvar tills att
nästa månad startar, och att en automatisk prisändring sker då.

---

### F1.2 — Kreditnota: när är det rätt åtgärd?

**Kontext:** Kund klagar på en faktura. Du har tre verktyg: refund (återbetala faktiskt), kreditnota (annullera fordran utan återbetalning), eller manuell rabatt på nästa faktura.

- **A) Kreditnota om kunden inte betalt än, refund om de betalt** — Bokföringsmässigt renast.
- **B) Alltid kreditnota + ny korrekt faktura** — Spårbart, men dubbelt så många dokument hos kunden.
- **C) Rabatt på nästa faktura om beloppet är litet (< 500 kr), kreditnota annars** — Pragmatiskt, mindre admin.

**Min rekommendation:** A. Best practice och kunden förstår.

**Ditt svar:** Jag tror kreditfaktura kommer vara viktigt i de fall de vill säga upp abonnemanget tidigt för att de är missnöjda.
Alternativt om en admin råkat ange fel värden, om en manuell ändring på den specifika fakturan är inlagd (t.ex. extra rader/pris inte stämmer).
I dessa fall behövs det finnas en möjlighet att kreditera månadskostnaden och inte "förstöra" det automatiserade med abonnemangen, som antas vara en recurringness varje 25e per månad.
Så om en ändring behövs göras på en faktura, så bör den kunna krediteras med en rad (helst för att inte betala tillbaka alla pengar, bara en del av fakturan) - 'eller' om det är
mer praktiskt, att en krediterad faktura i LeTrend admin dashboard bör kunna välja som en modal/popup (som en enhetlig funktion), att kreditera och sedan skicka ut en ny faktura direkt
för det nya eller separerade priset (som beräknas vara samma hela tiden, i alla fall gällande grundpris).

I LeTrend så kommer ett grundpris ligga på exempelvis 3000kr/månad. Detta flöder på hela tiden. Men i de fall extra rader adderas, som specialinspleningar, extra stöd eller annat, blir det extra rader "på" grundavtalet.
Där kan man tänka att det finns rum för kreditering (kund är missnöjd med fakturan). Som nämnt innan är också avbrott av avtal tidigt ett case värt att tänka på. Jag tror i grundappen som finns nu så finns ett flöde för
abonnemang som tar i beaktning (avsluta nu, utan återbetalning, avsluta nu, låt perioden löpa ut, m.fl). Detta är logiskt.

---

### F1.3 — Partiell refund: hur visas en faktura som är "halvbetald tillbaka"?

**Kontext:** Kund betalade 6 000 kr, fick 2 000 kr refunderat. I din lista ska fakturan synas som...

- **A) `paid` med en `refunded: 2000`-badge bredvid** — Ärligt, men listvyn blir brusig.
- **B) `partially_refunded` som egen status (egen färg)** — Tydligt men ny statusfärg att lära sig.
- **C) `paid` (oförändrad), refund syns bara i fakturadetaljvyn** — Listvyn stays clean, du måste klicka in för att se.

**Min rekommendation:** B — du behöver kunna filtrera "vilka kunder har fått refund senaste 90 dagarna" snabbt.

**Ditt svar:** Refunds hoppas man inte blir centralt i det operativa. Men om man gör en kreditfaktura på en rad, som i flödet beskrivet ovan, så blir b ok antar jag.

---

### F1.4 — Manuell faktura: när används den egentligen?

**Kontext:** UI tillåter "skapa manuell faktura". Vad är det operativa use-caset?

- **A) Engångsavgifter ovanpå abonnemang** (foto-paket, extra produktion, setup-fee)
- **B) Kund utan abonnemang** (fakturera projekt-baserat istället för månadsvis)
- **C) Korrigeringar** (efterdebitera glömd avgift, dela upp en stor faktura)
- **D) Alla ovan** — då behövs tre ingångar i UI med olika fält.

**Ditt svar:** Manuell faktura hade varit saker som inte är rimligt att placera på abonnemangsfakturor (Vilket inte är mycket), eller att
det finns tidigare tjänster levererade som inte lades till i rätt period, eller att LeTrend vill ha betalt snabbare. LeTrend vill ha 14 dagars betalningstid på fakturor. A är rätt förståelse.

Kund utan abonnemang blir en framtida sak. Alla kunder antas ta abonnemang för att ta del av plattformen.

C kanske. Men det ska upplevas som en smooth betalningsstruktur där allt prioriteras att läggas till på kommande fakturor. Kanske är det smart med ett sätt att skicka ett utskick i mail för extrakostnader.

Däremot kommer en admin också genom Gmail (personlig kundkontakt) formulera offerter eller ha muntliga avtal där priser godkänns, innan de adderas till "kommande" fakturor. Jag tror inte att det finns en funktion som
skapar kommande fakturor i förtid. Man kanske kommer undan utan att generera fakturor för kommande månaden, för att lägga till nya rader.


---

### F1.5 — Rabattkupong: hur länge gäller den som default?

**Kontext:** Du applicerar 20% rabatt på en kund. Stripe har tre durations: `once`, `repeating (X månader)`, `forever`.

- **A) `forever` som default — kunden behåller rabatten tills du aktivt tar bort den** (bra för "vi-erbjuder-rabatt-tills-vidare"-relationer)
- **B) `repeating 3 mån` som default — rabatten löper ut, du måste medvetet förlänga** (säkrare bokföringsmässigt)
- **C) Du tvingas välja varje gång, inget default** — mer friktion men inga misstag.

**Min rekommendation:** B + tydlig "rabatt upphör om X dagar"-indikator på kundkortet.

**Ditt svar:** Jag tror att rabatter till sin höjd kommer erbjudas för en månad. Ordet rabatt är inte heller rätt. Prissänkning eller erbjudande passar bättre.

I caset jag själv upplevt fram till denna punkt har jag erbjudit en gratismånad, då är en automatisk 1 månad för att sedan gå ner en rimlig kompromiss. Är det 2+ månader
kan jag lika gärna manuellt ändra priset för kund och ändra tillbaka det. Med fakturor och addera/ta bort rader kan en rabattrad finnas med möjlighet att ändra namnet på raden.
Värt att tänka på att LeTrend i dess nuvarande form inte är en renodlad SaaS. Målet på kort sikt är inte att ha 2000 kunder. Det är etapper av 30-60-90 uppemot 1000 kunder om 3-4 år. Det mesta är överskådligt,
trots att det i givetvis är snyggt med visuella anpassningar i UI.

---

### F1.6 — Kund som vill pausa abonnemanget i 1-2 månader (sommarstängt)

**Kontext:** Restaurang i Stockholm stängd juli. Vill inte betala men vill behålla sin slug, sin CM, sin TikTok-koppling.

- **A) Stripe-subscription pausas (ingen fakturering), CM:s arbete pausas, kund visas som `paused`** — Renaste flödet, men CM måste planera för "kommer tillbaka 1 aug".
- **B) Stripe pausas men CM fortsätter producera content för "lager"** (videos publiceras när kunden öppnar igen) — Bra för kunden, oklart vem som betalar för CM:s tid.
- **C) Ingen paus — kunden betalar full avgift och får mindre värde just denna månad** — Enklast operativt, kunden kan känna sig lurad.

**Min rekommendation:** A med tydlig "återupptas YYYY-MM-DD"-datum-indikator + automatisk reaktivering.

**Ditt svar:** Antagandet är att CM för betalt för pengarna som kommer in. Så är det pausat får CM inte pengar, vilket inte är problematiskt då tjänsten handlar om att kurera
åt kunden. Om det behövs arbete i förtid inför uppstart kan detta lösas senare. Så A vore inte dåligt. Pauser kan antas behöva startas manuellt.
Jag ser i praktiken att jag hade förhandlat ett sänkt pris med färre koncept eller något liknande. Då kanske man kan kasta på rabatterat pris i 2 månader eller vad som gäller.

---

## TEMA 2 — CM-ekonomi: lön, provision, byten

### F2.1 — Provisionsmodell vid CM-byte mid-month (default)

**Kontext:** Kund betalar 5 000 kr/mån. CM A hade kunden 1-15 mars, CM B tar över 16-31 mars. Provision är 20% (1 000 kr). Hur fördelas?

- **A) Pro-rata på dagar:** CM A får 484 kr (15/31), CM B får 516 kr (16/31). Rättvist, lätt att räkna.
- **B) Pro-rata på faktiskt arbete:** Räkna `cm_interactions` per CM den månaden, fördela 1000 kr proportionellt. Belönar aktivitet, straffar CM som tagit över "tyst" period.
- **C) Den CM som var ansvarig vid faktureringsdatum får 100%** — Enklast, men gör mid-month-byten till en "lottdragning" för CM.
- **D) Du väljer manuellt i UI vid varje byte** — Alltid rätt, men du måste komma ihåg.

**Min rekommendation:** A som default, D som override-knapp i CM-bytesmodalen.

**Ditt svar:** Det är A som gäller. Antagandet är att en standardiserad billing period är 25 till 25e. Kalkylen bör ske automatiskt. Kanske är det aktuellt att
få med detta i CMs profil eller någon typ av uträkning som sker i efterhand (t.ex. vilka kunder som servas av vilken CM under vilka perioder, med den uträkningen synlig).

Med detta underlag betalas löner ut månaden efter med dessa siffror som underlag. Däremot antas inte kunder byta CMs allt för ofta. Och det bör också gå att schemalägga byten
så att man inte manuellt behöver ändra en CM vid ett visst datum (även om man kan arbeta runt detta). Kanske med en notis som säger till när en kund och CM ska byta.

---

### F2.2 — Provision vid pausad kund

**Kontext:** Kund pausar i juli (F1.6). CM har planerat content i juni för publicering i augusti. Får CM provision i juli?

- **A) Nej — ingen fakturering, ingen provision.** CM "tappar" en månad.
- **B) Ja — om CM gjort minst X interaktioner under pausmånaden.** Belönar förberedelser.
- **C) Halv provision** (50%) som retainer för att CM "håller kunden warm".

**Ditt svar: Nej, CM får bara betalt för perioden de har en aktiv kund, så även om CM planerar för augusti får personen betalt för juni.

---

### F2.3 — Provision på manuella fakturor och engångsavgifter

**Kontext:** Du fakturerar 8 000 kr för ett extra fotopaket. CM gjorde själva produktionen. Provision?

- **A) Samma 20% på allt som faktureras kunden** — Enkelt, CM motiverad att merförsälja.
- **B) Bara på återkommande abonnemang, inte engångsavgifter** — Skyddar marginal på extraprodukter.
- **C) CM-specifik sats per fakturatyp** (t.ex. 30% på produktion, 20% på abonnemang) — Mer arbete att underhålla.

**Ditt svar:** Detta kalkyleras i efterhand. Extra avgifter antas beröra inspelningshjälp, klippning, speciella samarbeten och annat.
Om en CM ska ha kompensation för detta adderas det manuellt i betalningssystemet som LeTrend tillhandahåller. En CM räknas inte 
göra vissa saker, och om så, kan detta förhandlas i efterhand (jag kommer inte på standardiserade flöden som behöver en fast ratio nu)

---

### F2.4 — Provision vid kreditnota / refund

**Kontext:** CM fick 1 000 kr provision på en faktura i januari. I februari krediteras fakturan. Vad händer med provisionen?

- **A) Dras av automatiskt på nästa månads provisionsutbetalning** — Bokföringsmässigt rätt, kan kännas hårt för CM.
- **B) Ingen återkrav — det är "din" risk som admin** — Snällare, men dyrt om det händer ofta.
- **C) Bara återkrav om kreditnotan beror på CM:s fel** (kvalitetsproblem) — Rättvist men subjektivt.

**Ditt svar:** Detta är inte en viktig fråga. Provision finns inte exakt, men om det erbjuds, går det i betalningssystemet som möjliggör
ändringar i lön.

---

### F2.5 — Provisionsutbetalning: när och hur visas den?

**Kontext:** Du behöver veta varje månad: "vad ska jag betala till varje CM?"

- **A) Månadsvis utbetalning den 5:e i månaden för förra månadens provision** (faktura från CM till dig)
- **B) Realtids-tracker i CM:s eget UI: "du har tjänat X kr denna månad"** — motiverande men data-tungt
- **C) Båda — admin ser översikt, CM ser egen tracker** — bäst men mest att bygga

**Min rekommendation:** A först (kritiskt för att kunna driva), B i fas 2.

**Ditt svar:** En CM antas inte skicka fakturor. Istället är det LeTrend som arbetsgivare som betalar ut kompensation genom uträkningar.
Att skapa en tracker eller oversight för CM är inte prio, mest för att det är tydligt hur mycket en kund betalar LeTrend och hur många kunder som servas.
Så om MRR från LeTrends kunder är 15000kr kommer CMs kompensation vara 3000kr. Det behöver inte vara för mycket visualisering.

---

### F2.6 — Vad räknas som "aktiv" CM för lönesyfte?

**Kontext:** En CM kan ha 0 kunder en månad (du har inte tilldelat). Får hen lön/grundersättning?

- **A) Ren provision — inga kunder = ingen lön.** Vanligt i agency-modeller.
- **B) Garantilön + provision ovanpå** — Trygghet för CM, kostar dig.
- **C) Minimum-portfölj-garanti:** Du lovar minst 3 kunder per CM, om du bryter får CM kompensation.

**Ditt svar:** Nej, men detta sköts utanför kontexten av webappen LeTrend.

---

## TEMA 3 — Kundens lifecycle: signup, paus, churn, comeback

### F3.1 — Kund vill avsluta — vad är ditt operativa flöde?

**Kontext:** Kund mejlar "vi vill säga upp". Vad gör du i UI?

- **A) Markerar `cancel_at_period_end` — kunden kvar tills periodens slut, sen auto-arkiveras.** SaaS-standard.
- **B) Avslutar omedelbart + pro-rata refund för outnyttjad period** — Snäll mot kunden, kostar dig.
- **C) Avslutar omedelbart utan refund** — De har redan betalat, inget tillbaka.
- **D) "Pausa" som default-förslag istället för avsluta** — Försök rädda kunden.

**Min rekommendation:** A som default-knapp, B som "soft option" om kunden klagar.

**Ditt svar:** Denna typ av customizability är bra. Jag antar att A, men som mest B, är bra. Kreditering om kunden vill säga upp 
precis efter nästa billing period. Alla dessa är bra och bör ha stöd.

---

### F3.2 — Avhoppad kund kommer tillbaka 6 månader senare

**Kontext:** Restaurang som avslutade i oktober vill börja igen i april.

- **A) Återaktivera gamla kontot** — Behåller historik, TikTok-koppling, slug. Risk för stale data.
- **B) Skapa nytt konto, gamla arkiveras** — Rent start, tappar historik och kanske slug.
- **C) Återaktivera men "frys" gamla content/feedplan, börja om från slot 1** — Hybrid, mest arbete.

**Ditt svar:** Återaktivera. Men detta flöde kan man skapa support för senare. I praktiken handlar det om av återaktivera kontot,
starta subscription igen, och användade TikTok synk för att få in de koncept/videos som producerats av kund så att själva tidslinjen
som grundar LeTrends arbetsflöde är tillbaka. Det finns redan stöd för LeTrend-koncept och renodlade TikTok koncept (hur de bedöms vara det ena eller andra),
så det behöver inte börja om från 0.

---

### F3.3 — Kund i `past_due` (missat betalning) — när blockas appen?

**Kontext:** Stripe har misslyckats debitera kort. Stripe kommer försöka 3 gånger på 21 dagar.

- **A) Blockera kundens åtkomst direkt vid första failed payment** — Hårt, kan vara temporärt kortproblem.
- **B) Blockera efter 7 dagar i `past_due`** — Buffer för kunden att fixa.
- **C) Blockera efter Stripe gett upp helt (ca 21 dagar)** — Mycket snäll, du jobbar gratis i 3 veckor.
- **D) Aldrig auto-blockera — du beslutar manuellt per kund** — Full kontroll, kräver att du kollar varje dag.

**Min rekommendation:** B + automatisk e-post till kund vid dag 1, 3, 7.

**Ditt svar:** Appen behöver inte blockeras. Kommunikationen gentemot CM är då att inte serva kunden, ladda in koncept.
LeTrend kan säga upp avtalet och då lika gärna avskriva den fakturan som inte betalts. Så inget gratis arbete. Men att skapa ett
case state där kunden inte betalar, hur detta hanteras (nu räknas admin ringa kunden och se status), är bra för operativt flöde.

---

### F3.4 — Vad händer för CM när "deras" kund blir blockerad?

**Kontext:** Kund slutar betala. CM A har 6 kunder, en blir blockerad.

- **A) CM ser kunden som "pausad" i sin vy, slutar producera content** — Skyddar din marginal.
- **B) CM fortsätter, du betalar provision ändå (förutsätter att kunden återupptar)** — Snäll, dyrt.
- **C) CM får val i sitt UI: "fortsätt eller pausa"** — För mycket beslut till CM.

**Ditt svar:** Ja, pausad. A är ok. Det blir case till case.

---

### F3.5 — Kund signar upp men onboardar aldrig (klickar invite, gör inget)

**Kontext:** Du skickade invite för 2 veckor sen. Kund öppnade länken men loggade aldrig in. Stripe-kund finns inte än.

- **A) Auto-arkivera efter 30 dagar utan aktivitet** — Håller listan ren.
- **B) Auto-påminnelse via e-post dag 3, 7, 14, sen arkivera dag 30** — Mer bemötande.
- **C) Stannar i `invited` för evigt tills du manuellt agerar** — Ingen automatik, ingen risk för fel.

**Min rekommendation:** B.

**Ditt svar:** Invite flödet just nu gör att kunden får ett mail (som antingen eller inte klickas på), väljer lösenord (Som antingen eller inte klickas på),
går vidare med onboardingflödet (pre-payment), som antingen eller inte händer, går vidare med betalning (som antingen eller inte händer), och sedan landar i landing page.

Att kunna skicka ut en ny invite är bra, ifall det buggar med registrering eller länk går ut. Om betalning inte går igenom, kan detta också vara en påminnelse (+ tänka ut det förväntade flödet för kundens inloggning pre payment).

Att starta ett konto är i nuvarande flödet både lös och hård, i avseendet att demos kan skickas ut genom kundinvite för att skapa en kundprofil som kan impasseras grundläggande planering eller koncept för att visa som demo.
Men när ett pris är satt, och en invite görs, förväntas kunden ha godkänt en offert per mail. Alltså är detta då ett hårt flöde som antas vara det administrativa för att komma igång.
Auto påminnelse vet jag inget om, men jag tänker mig att det kan finnas visuella signaler i admin/cm som visar på försening. Som jag nämnt tidigare är kundantalet inte hundratals inledningsvis, därför kan man
komma undan med manuell handläggning, trots att automatisk arkivering kan vara bra (och hur återställer man från arkivering till aktivt igen - ett flöde värt att tänka på).

---

## TEMA 4 — CM-arbete: handover, frånvaro, prestationsbedömning

### F4.1 — CM-byte: vad är "officiell" handover-procedur?

**Kontext:** CM A → CM B. Vad MÅSTE hända innan bytet är "klart"?

- **A) Inget formellt — admin byter, CM B börjar jobba imorgon** — Snabbt men risk för luckor.
- **B) Handover-anteckning krävs (CM A skriver "kunden gillar X, undvik Y") innan bytet kan slutföras** — Bra kontinuitet, friktion för admin.
- **C) 7-dagars överlapp där båda har access, sen tas A bort automatiskt** — Säkert men dubbla provisioner i en vecka.

**Ditt svar:** A. Ingen mer behövs sannolikt.

---

### F4.2 — CM-frånvaro: hur ska systemet veta?

**Kontext:** CM är sjuk i 2 veckor. Idag rödflaggas alla deras kunder felaktigt som "needs_action".

- **A) CM markerar själv frånvaro i sitt UI (från-till-datum)** — Beroende av att CM gör det.
- **B) Admin markerar för CM i team-vyn** — Du har kontroll, mer arbete.
- **C) Auto-detektion: 0 interaktioner i 5 dagar = "möjlig frånvaro?"-prompt till admin** — Smart men kan fela.

**Min rekommendation:** A primärt, B som backup.

**Ditt svar:** Jag tänker att en annan CM kan kopplas in temporärt av admin. Att CM meddelar admin och att omställning sker temporärt.

---

### F4.3 — Vid CM-frånvaro: vem tar deras kunder?

**Kontext:** CM sjukskriven 3 veckor.

- **A) Inget händer — kunder pausas operativt, ingen content produceras** — Kunder märker, klagar.
- **B) Admin (du) tar tillfälligt över** — Realistiskt om 1-2 CMs sjuka, ohållbart vid fler.
- **C) Auto-omfördelning till CM med lägst portfölj** — Belastar friska CMs.
- **D) Konfigurerbar "buddy-CM" per CM som auto-tar över** — Bästa, men kräver setup.

**Ditt svar:** Omfördelningen blir en del av vad admin sköter. Antingen omfördelas det, eller så meddelas det till kund. Antagandet är att en admin
kan hantera 5-10 kunder utan problem, trots att en admin inte vill arbeta med CM arbete. Ingen auto-omfördelning, det sker manuellt.

---

### F4.4 — Hur mäts en CM:s prestation operativt?

**Kontext:** Du behöver veta: "är denna CM bra på sitt jobb?"

- **A) Antal interaktioner per kund per vecka (kvantitativt)** — Lätt att mäta, missar kvalitet.
- **B) Buffer-status hos kunder (alla `ok` = bra CM)** — Outcome-baserat, men beror på kunden också.
- **C) Kombination + kund-NPS-undersökning kvartalsvis** — Mest korrekt, mest arbete.
- **D) Ingen automatisk mätning — du bedömer subjektivt** — Mänskligt, inte skalbart.

**Min rekommendation:** B som primär metric, A som sanity-check.

**Ditt svar:** Detta är inte för systemet att bedöma. Det finns redan buffer-status och hur mycket en CM arbetar. En admin kommer ha relation till kund
och även se output i statistikpanelen. Om output är bra kan dålig prestation på plattformen ursäkas, det är inte alltid success = bra arbete. Det finns redan
flöden och signaler i appen som visar på CMs produktion. Om det inte är bra produktion kommer admin diskutera och försöka bidra till förbättring.

---

### F4.5 — Får CM jobba "utanför appen" (WhatsApp, telefon med kund)?

**Kontext:** Mycket kommunikation sker IRL. Det syns inte i `cm_interactions`. Status visas felaktigt som "låg aktivitet".

- **A) CM måste logga extern aktivitet manuellt ("ringt kund 15 min")** — Spårbart, friktion för CM.
- **B) Acceptera blind-spot — admin vet att vissa CMs jobbar mycket utanför** — Mänskligt, men status-färger blir lögn.
- **C) WhatsApp-integration som auto-loggar meddelanden** — Bäst, mest att bygga.

**Ditt svar:** B. Ett samtal eller kundbesök är en del av CMs jobb. Det behöver inte loggas.

---

## TEMA 5 — Content & feedplan: ansvar och beslut

### F5.1 — Vem äger feedplan-besluten — CM eller kund?

**Kontext:** CM föreslår nästa video. Måste kunden godkänna?

- **A) CM beslutar fritt, kunden ser resultat efter publicering** — Snabbt, kund kan känna sig kontrollerad.
- **B) Kund måste godkänna varje koncept innan filmning** — Trygghet för kund, blockerar CM:s flow.
- **C) Kund godkänner månadens "tema/riktning", CM beslutar inom det** — Bra balans.

**Ditt svar:** Det är CM som bestämmer. Flödet är CM beslutar planen och ger ett template-koncept -> kunden ser konceptet och producerar -> kunden laddar upp.

Kunden behöver inte godkänna koncept. Men, om kunden inte gillar koncept kan dessa bytas ut om diskussionen är att det bör ändras. Kundens UI och interaction mot CM är inte utformat än, men detta kan funderas på (om kommunikation mellan kund -> CM går via webappen eller tel, men just nu är det tel).


---

### F5.2 — Vad räknas som "publicerat" i bufferten?

**Kontext:** Buffert räknar antal videos kvar att publicera. När ska en video räknas som "förbrukad"?

- **A) När CM markerar "publicerat" i UI** — Beroende av att CM gör det.
- **B) När TikTok-API bekräftar att videon finns på kontot** — Automatiskt, kräver TikTok-koppling.
- **C) På `planned_publish_date` — videon antas publicerad även om CM glömt markera** — Optimistiskt, kan ge fel buffer.

**Min rekommendation:** B om TikTok-kopplad, A som fallback.

**Ditt svar:** B finns implementerat. Det finns en så kallad "lazy" tidsräkning som håller antal koncept planerade per vecka. Det kan vara 2, 3, 4 etc.
När en CM laddar in koncept kan det vara en i taget, flera samtidigt, flera samtidigt som också planerar för den kommande veckan.

Vad "publicerat" innebär för mig är att kunden sett konceptet, spelat in, och laddat upp konceptet till deras tiktok. Detta syns i teiktok-hämtningen.

Att ladda in koncept i kundens timeline (en plan för kommande koncept) kan också bedömas vara "publicerat", men mer träffsäkert ord vore
förberett/placerat i tidslinje. Då har kunden allt hen behöver för att implementera planen.

---

### F5.3 — Vad gör du när bufferten är `under` (för få videos)?

**Kontext:** Operativt — vad är förväntad åtgärd?

- **A) Auto-alert till CM ("ladda upp 2 nya koncept inom 48h")** — Påtryckande.
- **B) Alert till admin (du) som följer upp med CM** — Du förblir i loopen.
- **C) Båda** — Mest synlighet, mest brus.

**Ditt svar:** B. Men alert är starkt ord, jag behöver inte se mer än vad som redan finns nu, dvs en mätning om CM håller sig i fas eller inte.


---

## TEMA 6 — Kommunikation och eskalering

### F6.1 — När ska kunden få automatisk e-post (utan att du klickar)?

**Kontext:** Vilka är "always-auto"-mejl?

- **A) Bara Stripe-mejl (faktura, betalningskvitto, failed payment)** — Minimal, kunden förstår "Stripe = pengar".
- **B) Stripe + onboarding (välkomstmejl, TikTok-kopplingspåminnelse)** — Standard SaaS.
- **C) Stripe + onboarding + content-notiser ("ny video publicerad")** — Aktivt, kan upplevas som spam.

**Ditt svar:** Alla i A. Välkomst-mail, onboarding. TikTok-koppling görs av en CM, inte kunden. Dessa flöden är uttänkta och behöver inte funderas på i denna kontext.

---

### F6.2 — Hur upptäcker du saker som hänt när du inte tittade?

**Kontext:** Du loggar in måndag morgon. Helgen har gått. Vad händer?

- **A) "Vad du missat"-vy på Overview: lista över events sedan senaste login** — Du fångar allt.
- **B) Bell-ikon med olästa notifikationer i headern** — Standard, men kan ignoreras.
- **C) E-postsammanfattning kl 09:00 varje vardag** — Du ser det innan du loggar in.
- **D) Alla tre** — Maximal täckning.

**Min rekommendation:** A + C i fas 1, B i fas 2.

**Ditt svar:** När jag loggar in i overview finns det nu lista med saker som behöver åtgärd. Men flödet i admin är nu att jag kan se
vilka CMs som är i fas. Har jag hört klagomål från kunden ser jag det per mail, eller så följer jag upp med kund för att se hur de upplever samarbetet
och relayar till CM. Prioritering i overview-sidan, där t.ex. missade fakturor kommer upp, eller kunder som släpar efter, kan tänkas ut och prioriteras
på bedömt severity av hur viktigt/aktuellt det är att hantera.

---

### F6.3 — Eskaleringsnivåer: vad är "akut" vs "kan vänta"?

**Kontext:** Du behöver prioritera. Vad förtjänar omedelbar uppmärksamhet?

- **A) Akut:** Kund i `past_due` > 3 dagar | TikTok-token revoked | Stripe webhook misslyckas | CM 0 aktivitet 7+ dagar
- **B) Kan vänta:** Buffer `thin` | Kund i `pending` 14+ dagar | Onboarding ej slutförd
- **C) FYI:** Ny faktura skapad | Video publicerad | CM uppdaterat koncept

Stämmer denna gruppering med din intuition? Justera fritt.

**Ditt svar:** Fakturor som inte betalats (dvs subscriptions som inte går igenom) är viktig. 0 CM aktivitet eller låg är också biktig.

Men detta låter inte orimligt. Låt också mina tidigare svar guida din förståelse för vad jag som admin kan anse vara värdefullt att förstå eller se
gällande relationen till CMs.

---

## TEMA 7 — Säkerhet och destruktiva åtgärder

### F7.1 — Vilka åtgärder ska kräva bekräftelse-modal?

**Kontext:** Vad är "tänk efter en gång till"-nivå?

- **A) Bara hard delete** (GDPR-radera kund permanent)
- **B) Hard delete + arkivera CM + void faktura** (allt med ekonomisk eller juridisk konsekvens)
- **C) Allt destruktivt + alla prisändringar** — Säkrast, mest klick.

**Min rekommendation:** B.

**Ditt svar:** B.

---

### F7.2 — Vad är "ångra-bart" i 24h vs omedelbart permanent?

**Kontext:** Vissa åtgärder kanske ska ha en "ångra"-toast i 10 sekunder?

- **A) Ingen ångra — alla actions är direkt slutgiltiga** (med modal-bekräftelse där det behövs)
- **B) "Ångra"-toast 10s för: arkivera, byt CM, applicera rabatt** (saker som ofta är klick-fel)
- **C) 24h soft-delete för arkivering, sen permanent** — Ger marginal mot panik-actions.

**Ditt svar:** Att byta CM är snabbt och kostar inget, i alla fall i nuvarande implementationen. Om en CM bara varit omfördelad i upp till 24-48h kanske det är bra
att inte tänka att den formellt haft något ansvar, och en betalning inte behöver planeras om. Att arkivera är också low effort och smidigt. En arkivering blir
enbart i admin-flödet relevant. Att avsluta avtal med kund räknas göras formellt i skrift eller efter muntlig diskussion, där det finns det förväntade flödet i appen för att
stänga av abonnemang, och efter det arkivera. Kanske arkivering är en automatisk close efter att abonnemanget är slut. I allmänhet tror jag detta bör följa praxis och något som möjliggör flexibilitet,
så att viktig kunddata inte försvinner. Gällande GDPR kan detta hanteras i efterhand eller programmera in annan logik för slutlig removal.

---

### F7.3 — Multi-admin (om/när du anställer någon)

**Kontext:** Om du tar in en kollega som också ska kunna admin:a — vad är deras gränser?

- **A) Full admin = full admin, vi litar på varandra** — Enkelt.
- **B) Roller: "super-admin" (du, kan allt) + "operations-admin" (kan se/redigera men inte radera/refunda)** — Säkrare.
- **C) Per-resurs roller** (t.ex. "billing-admin" får bara röra fakturor) — Granular, mer setup.

**Ditt svar:** B låter rimligt. Med tiden kan en annan typ av median-roll mellan full admin och CM formas, någon som ansvarar för flera CMs och kan hantera
vissa admin flöden i backend. På tal om detta verkar det inte finnas ett flöde i admin att bjuda in admins.

---

## TEMA 8 — Onboarding ur kundens perspektiv

### F8.1 — Vad ser kunden direkt efter att ha klickat invite-länken?

**Kontext:** Idag är detta odefinierat. Vad är det första kunden möter?

- **A) Lösenord-skapande, sen tom dashboard, sen "vänta på din CM"-text** — Minimal.
- **B) Lösenord → välkomst-video från dig → koppla TikTok → "din CM hör av sig inom 24h"** — Premium-känsla.
- **C) Lösenord → checklista med 3 steg (profil, TikTok, första-möte-bokning)** — Aktivt, kunden känner framgång.

**Ditt svar:** Det finns ett flöde, men den hoppas jag optimera. Det är en enklare onboarding med bild på CM, samarbetets utformning,
där kunden landar i sin (antingen) populerade tidslinje eller tomma tidslinje, en ifylld eller inte ifylld "game plan" (beskrivning i textform),
och annat. Välkomstvideo vore coolt, men det kommer senare. Koppla tiktok görs i admin eller av CM i förhand. Möten antas ske med kund på plats,
men distans kan säkert ordnas genom mail och digitala möten.

---

### F8.2 — När i onboardingen kopplas TikTok?

**Kontext:** Operativt avgörande för att CM ska kunna börja jobba.

- **A) Tvingande steg 2 i onboarding — kunden kan inte gå vidare utan att koppla** — Garanterar data, friktion.
- **B) Föreslås men hoppningsbart — CM påminner manuellt sen** — Smidigt, många glömmer.
- **C) Skickas som separat länk dag 2 efter onboarding-completion** — Mindre överväldigande.

**Ditt svar:** x.

---

### F8.3 — Vad händer om kunden hoppar över TikTok-koppling?

**Kontext:** Konsekvens i CM:s arbete och i din statistik.

- **A) CM kan inte börja jobba effektivt — kunden parkeras i "väntar på TikTok"-status** — Tydlig konsekvens.
- **B) CM jobbar ändå men utan stats — buffer/pulse beräknas inte korrekt** — Suboptimalt.
- **C) Auto-blockering efter 14 dagar utan TikTok** — Hårt men driver action.

**Ditt svar:** x.

---

## TEMA 9 — Edge cases du sannolikt själv mött

### F9.1 — Kund byter restaurangnamn (rebrand mid-contract)

- **A) Slug ändras, gamla demo-länkar slutar fungera** — Rent men kan förvirra existerande mottagare av länkar.
- **B) Slug är immutable — namnändring uppdaterar bara display, slug stannar** — Säkrast för länkar.
- **C) Ny slug + redirect från gammal i 90 dagar** — Bästa.

**Ditt svar:** Namnet på restaurangen byts ut i dashboard. Jag vet inte varför demo-länkar ska sluta fungera, nuvarande demo
är en template-version av en kunds riktiga dashboard (om de var en kund), med samma typ av timeline, game plan och annat, med en tiktok-profil synkad.
Tiktok synk i mitt nuvarande repo går utanför kontexten av TikTok auth, istället hämtas metadata genom en fetcher API som populerar en profil med metadata.

Det finns ingen visuell slug. Det vore dock problematiskt eller i behov av optimering om kunden byter deras användarnamn på tiktok.

---

### F9.2 — Restaurang byter ägare mid-contract

**Kontext:** Ny ägare ska ta över kontot. Inget ägarskiftes-flöde idag.

- **A) Nytt konto, arkivera gamla, ingen historik-överföring** — Rent men kunden tappar allt.
- **B) Ändra primär e-post + uppdatera Stripe customer email, behåll allt** — Smidigt.
- **C) Formellt "transfer ownership"-flöde med dubbelbekräftelse från båda parter** — Säkert, mest att bygga.

**Ditt svar:** Ägarbyte låter inte relevant, då ett ägarbyte då hade stängt av abonnemanget. Men jag kan tänka mig att
det finns ett värde att kunna byta ut primär-epost om betalning ska byta mottagare (ett nytt betalningssystem hos kund), där alla
samspel mellan kundens kontaktemail (eller billing-email) också synkroniseras till Stripe och annat.

---

### F9.3 — Kund med 2 restauranger (samma ägare, olika konton?)

- **A) Ett konto = en restaurang. Ägaren har två konton att logga in på.** — Rent datamässigt, jobbigt för kunden.
- **B) Ett konto kan ha flera restauranger (multi-tenant inom kund)** — Bättre UX, mer komplext.
- **C) Vi bygger detta först när någon faktiskt frågar** — YAGNI.

**Ditt svar:** Ett konto är en restaurang. Kunden kan ha två eller flera konton. Men du har rätt, om det behövs kan det ordnas.

---

### F9.4 — Du upptäcker att du fakturerat fel belopp i 3 månader

**Kontext:** Klassisk admin-mardröm. Vad är ditt go-to-flöde?

- **A) Tre kreditnotor + tre nya korrekta fakturor** — Tydligt, mycket dokument.
- **B) En samlad korrigering + e-post som förklarar** — Smidigare, kräver fritext-faktura.
- **C) Justera framåt: nästa faktura korrigerar bakåt** — Enklast, juridiskt diskutabelt.

**Ditt svar:** Jag tror inte detta är nödvändgt. Jag hade då skrivit ett email manuellt och försökt kompensera på nästa fakturor.

---

## TEMA 10 — Defaults och "inställningar du sällan rör"

### F10.1 — Default fakturerings-intervall vid ny kund?
- A) Månad B) Kvartal C) Du väljer alltid manuellt
**Ditt svar:** Månadsvis.

### F10.2 — Default betalningsvillkor på manuell faktura?
- A) 14 dagar B) 30 dagar C) Direkt (kort i Stripe)
**Ditt svar:** 14.

### F10.3 — Default valuta?
- A) SEK alltid B) Per kund C) Auto från kundens land
**Ditt svar:** SEK, mest för att internationell anpassning kommer senare (antar jag).

### F10.4 — Default CM-provisionssats för ny CM?
- A) 20% B) Fritt val per CM C) Stege baserat på portföljstorlek
**Ditt svar:** 20%, vore dock intressant att kunna ställa om detta i admin-dashboard eller per CM.

### F10.5 — Default expected_concepts_7d för ny kund?
- A) 3 (en var-annan-dag) B) 5 (nästan varje dag) C) Kund-storleksberoende
**Ditt svar:** Det finns en lazy-tidsräkning i varje kund, som defaultar till 2/vecka.

Om en kund har två inlagda för nästkommande vecka är det värdefullt. Men en CM kan också lägga in koncept för vecka 2 och 3 (förmodligen upp till 3-4 veckor).

Detta kan multipliceras med det förhandlade tempot. Alltså 2*3, 3*3 osv. Men förväntan är lazy tidsräkning för en vecka som standard.

---

## Användning för agenten

När alla svar är ifyllda ska agenten:
1. **Läsa svaren tema för tema** och skapa en `OPERATIONAL-DEFAULTS.md` med konkreta regler.
2. **Cross-referencea** med `UI-BRAINSTORM-V2-KATEGORISERAT.md` (tekniska scenarios) och `V3-FLOWS` (UI-flöden) för att se var operativa beslut påverkar implementation.
3. **Generera SQL-migrations** för fält som krävs (t.ex. `commission_rate` per CM, `pause_until` på subscription, `default_billing_interval` i settings).
4. **Bygga UI-flöden** som speglar valda defaults men låter dig override:a per fall.
5. **Lista kvarstående gråzoner** där svaren var tvetydiga eller där agenten behöver mer kontext.

---

**Slut på dokument. Fyll i svaren och skicka tillbaka — agenten tar det därifrån.**
