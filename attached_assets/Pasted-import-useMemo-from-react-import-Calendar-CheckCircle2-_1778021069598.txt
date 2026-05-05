import { useMemo } from "react";
import {
  Calendar,
  CheckCircle2,
  Handshake,
  MessageCircle,
  Scissors,
  Smartphone,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Wand2,
} from "lucide-react";
import { GamePlanDisplay } from "../gameplan/GamePlanDisplay";
import { CustomerPlannerGrid, type CustomerPlannerSlot } from "./CustomerPlannerGrid";
import mahmoudImg from "@/assets/demo-cm-mahmoud.jpg";
import appMockImg from "@/assets/demo-app-mock.png";
import creatorEmmaImg from "@/assets/demo-creator-emma.png";

export type DemoPreviewPayload = {
  demo: {
    id: string;
    companyName: string;
    contactName: string | null;
    contactEmail: string | null;
    tiktokHandle: string | null;
    tiktokProfilePicUrl: string | null;
    proposedConceptsPerWeek: number | null;
    proposedPriceOre: number | null;
    status: string;
    shareToken: string;
    customerId: string | null;
    logoUrl: string | null;
    previewNotes: string | null;
    previewSettings: Record<string, unknown>;
    previewMetrics: Record<string, unknown>;
    gamePlanText: string | null;
    gamePlanHtml: string | null;
    contentManager: {
      id: string | null;
      profileId: string | null;
      name: string;
      avatarUrl: string | null;
      color: string | null;
      city: string | null;
    };
  };
  concepts: CustomerPlannerSlot[];
};

function readNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") { const n = parseFloat(v); return Number.isFinite(n) ? n : null; }
  return null;
}

function readNumArr(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const arr = v.map(readNum);
  if (arr.some((x) => x === null)) return null;
  return arr as number[];
}

export function DemoLandingView({ payload }: { payload: DemoPreviewPayload }) {
  const { demo, concepts } = payload;
  const slots = useMemo(() => concepts ?? [], [concepts]);
  const greetingName = demo.contactName?.trim() || "friend";
  const conceptsPerWeek = demo.proposedConceptsPerWeek ?? 2;
  const cmName = demo.contentManager?.name?.trim() || "Mahmoud";
  const cmAvatar = demo.contentManager?.avatarUrl || mahmoudImg;
  const mailSubject = encodeURIComponent(`Demo för ${demo.companyName}`);
  const mailBody = encodeURIComponent(
    `Hej LeTrend,\n\nVi tittade på demoförslaget för ${demo.companyName} och vill höra mer.\n\n`,
  );
  const hasGamePlan = Boolean(demo.gamePlanHtml || demo.gamePlanText);
  const tiktokHandleClean = demo.tiktokHandle ? `@${demo.tiktokHandle.replace(/^@/, "")}` : demo.companyName;

  const m = demo.previewMetrics ?? {};
  const avgViews30d = readNum(m.avg_views_30d) ?? readNum(m.avg_views) ?? readNum(m.averageViews);
  const likeRate30d = readNum(m.like_rate_30d) ?? readNum(m.like_rate);
  const genombrott_viral = readNum(m.genombrott_viral) ?? 0;
  const genombrott_hit = readNum(m.genombrott_hit) ?? 0;
  const genombrott_klipp = readNum(m.genombrott_klipp) ?? readNum(m.video_count_30d) ?? 0;

  const hasLiveStats = avgViews30d !== null || likeRate30d !== null;

  const avgViewsDisplay = avgViews30d != null
    ? Math.round(avgViews30d).toLocaleString("sv-SE")
    : "—";
  const genombrott_display = hasLiveStats
    ? `${genombrott_viral} / ${genombrott_hit} / ${genombrott_klipp}`
    : "—";
  const likeRateDisplay = likeRate30d != null
    ? `${likeRate30d.toFixed(1).replace(".", ",")}%`
    : "—";

  const likeRateHint = likeRate30d != null
    ? (likeRate30d >= 5 ? "Starkt" : likeRate30d >= 2 ? "Ok" : "Lågt")
    : "30d";

  const chartValues = readNumArr(m.chart_values);

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden border-b-2 border-foreground bg-brand py-20 text-brand-foreground md:py-28">
        <div className="container relative z-10 mx-auto max-w-4xl px-6">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-gold">
            LeTrend · Demo för {demo.companyName}
          </p>
          <h1 className="font-serif-display text-4xl font-black leading-[1.05] md:text-6xl">
            En kort interaktiv demo.
          </h1>
          <div className="mt-6 max-w-2xl space-y-4 text-base opacity-85 md:text-lg">
            <p>
              Hej {greetingName}. LeTrend är i grund och botten en marknadsföringstjänst för TikTok. Med en egen
              plattform, AI-funktioner och mänsklig hjälp guidar vi er strategi för att nå fler ögon och kunder.
            </p>
            <p>
              De flesta byråer säljer in paket som inkluderar produktion, kurering och strategi. Vi gör nästan samma,
              men exkluderar produktionen. Med en smartphone, vår app och lite guidning tror vi de flesta kan lyckas på
              TikTok. Det driver ner kostnader samtidigt som virala trender kan fångas snabbare till er fördel.
            </p>
            <p>
              Nedan har vi förberett ett demo som visar vart ni är och vart ni kan landa. Vi rekommenderar{" "}
              <strong>{conceptsPerWeek} koncept i veckan</strong>, anpassade till er bransch, ton och era egna styrkor.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ FEEDPLAN ═══ */}
      <section className="border-b-2 border-foreground bg-blush/40 py-16 md:py-20">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <div className="grid items-stretch gap-10 md:grid-cols-[5fr_7fr] md:gap-16">
            <div className="flex flex-col">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-accent">Feedplan</p>
              <h2 className="font-serif-display text-3xl font-bold leading-tight md:text-4xl">
                Så här skulle er feed kunna se ut
              </h2>
              <div className="mt-5 space-y-4 text-sm leading-relaxed text-foreground/85 md:text-base">
                <p>
                  LeTrend arbetar med kreativt bricolage — samma typ av pyssel som när man var liten och klippte ihop
                  delar från olika tidningar till något nytt.
                </p>
                <p>
                  Det finns ingen brist på kreativitet på TikTok. Det handlar om vem som är snabbast på bollen. En rolig
                  idé kan generera hundratusentals visningar om den utförs rätt och känns fräsch för publiken.
                </p>
                <p>
                  Vi fångar virala trender tidigt och använder vår plattform för att rekommendera och visa er exakt vad
                  ni behöver göra för att återskapa idéerna i er egen ton.
                </p>
                <p>
                  Resultatet? Visningar, igenkännedom och en marknadsföringsstrategi som fångar många ögon med enkla
                  medel.
                </p>
              </div>

              <div className="mt-6 flex items-center gap-3">
                <img
                  src={cmAvatar}
                  alt={`${cmName}, content manager på LeTrend`}
                  loading="lazy"
                  width={56}
                  height={56}
                  className="h-12 w-12 rounded-full border-2 border-foreground object-cover"
                />
                <div className="text-sm leading-snug text-foreground/85">
                  <strong className="text-foreground">{cmName}</strong> är er content manager — kurerar koncepten i
                  feeden och guidar er vecka för vecka.
                </div>
              </div>
            </div>

            <div className="mx-auto flex w-full max-w-[400px] items-center justify-center md:max-w-[440px]">
              <CustomerPlannerGrid slots={slots} companyName={demo.companyName} />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ GAME PLAN ═══ */}
      <section className="border-b-2 border-foreground bg-mint/30 py-16 md:py-20">
        <div className="container mx-auto max-w-5xl px-6">
          <div className="grid items-stretch gap-10 md:grid-cols-[5fr_7fr] md:gap-14">
            <div className="flex flex-col">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-accent">Game Plan</p>
              <h2 className="font-serif-display text-3xl font-bold leading-tight md:text-4xl">Våra spaningar</h2>
              <div className="mt-4 space-y-4 text-sm leading-relaxed text-foreground/85 md:text-base">
                <p>
                  Game Plan är arbetsdokumentet där er content manager samlar allt som rör er strategi — vad ni redan
                  gör bra, vad som kan skärpas, referenser värda att titta på och vilka format vi tror på framåt.
                </p>
                <p>
                  Dokumentet är levande. Det börjar redan innan vi pratats vid och fylls på vecka för vecka i takt med
                  att vi lär känna er och era kunder bättre.
                </p>
                <p className="text-xs text-muted-foreground">Nedan: ett tidigt utdrag för {demo.companyName}.</p>
              </div>

              <div className="mt-6 flex items-center gap-3">
                <img
                  src={cmAvatar}
                  alt={`${cmName}, content manager på LeTrend`}
                  loading="lazy"
                  width={48}
                  height={48}
                  className="h-10 w-10 rounded-full border-2 border-foreground object-cover"
                />
                <div className="text-xs text-muted-foreground">
                  Skrivet av <strong className="text-foreground">{cmName}</strong>
                  {" · senast uppdaterat idag"}
                </div>
              </div>
            </div>

            {/* Notepad */}
            <div className="flex flex-col rounded-md border-2 border-foreground bg-[#fdfcf7] shadow-hard">
              <div className="flex items-center justify-between gap-3 border-b-2 border-foreground/15 px-5 py-2.5">
                <div className="flex items-center gap-2 font-mono text-[11px] text-foreground/60">
                  <span className="h-2 w-2 rounded-full bg-foreground/30" />
                  game-plan / {demo.companyName.toLowerCase().replace(/\s+/g, "-")}.md
                </div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-foreground/40">utkast</div>
              </div>

              <div className="flex-1 px-6 py-6 font-serif-display text-[15px] leading-[1.75] text-foreground md:px-8 md:py-7">
                <h3 className="mb-1 text-xl font-bold">Första intryck — {tiktokHandleClean}</h3>
                <p className="mb-5 font-sans text-xs text-muted-foreground">
                  Anteckningar efter en första genomgång av kontot.
                </p>

                {hasGamePlan ? (
                  demo.gamePlanHtml ? (
                    <GamePlanDisplay html={demo.gamePlanHtml} />
                  ) : (
                    <div className="whitespace-pre-wrap">{demo.gamePlanText}</div>
                  )
                ) : (
                  <>
                    <p className="mb-4">
                      Det första som slår mig är att ni faktiskt redan har en ton. Det syns i närbilderna och i hur ni
                      pratar i kameran — det känns som er, inte som en mall. Bra utgångspunkt: vi behöver inte bygga ett
                      uttryck från noll, utan snarare hjälpa er leverera det oftare och tydligare.
                    </p>
                    <p className="mb-4">
                      Det jag vill jobba med först är <em>tempot</em>. Ni publicerar ojämnt, och de bästa klippen
                      drunknar i veckor utan aktivitet. {conceptsPerWeek} koncept i veckan, varje vecka, gör mer än fem
                      klipp en månad och tystnad nästa.
                    </p>
                    <p className="text-foreground/80">
                      Mer kommer när vi pratats vid — särskilt kring vad ni själva tycker fungerat, och vad som känts
                      segt att göra.
                    </p>
                  </>
                )}

                <div className="mt-6 flex items-center gap-2 border-t-2 border-dashed border-foreground/15 pt-3 font-mono text-[11px] text-muted-foreground">
                  <span className="inline-block h-3 w-[1.5px] animate-pulse bg-foreground/60" />
                  fortsätter skriva…
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ TIKTOK-STATISTIK ═══ */}
      <section className="border-b-2 border-foreground bg-lavender/30 py-16 md:py-20">
        <div className="container mx-auto max-w-5xl px-6">
          <div className="grid items-stretch gap-10 md:grid-cols-[7fr_5fr] md:gap-14">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="Snitt visningar" value={avgViewsDisplay} hint="30d · per klipp" />
                <StatCard label="Genombrott" value={genombrott_display} hint="viral / hit / klipp" />
                <StatCard label="Like rate" value={likeRateDisplay} hint={likeRateHint} />
              </div>

              <div className="flex flex-1 flex-col rounded-2xl border-2 border-foreground bg-card p-5 shadow-hard-sm">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-foreground/70">
                    Visningar per klipp · senaste 30 dagar
                  </p>
                  <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                    <Legend swatchClass="bg-accent" label="Klipp" />
                    <Legend swatchClass="bg-gold" label="Hit" />
                    <Legend swatchClass="bg-brand" label="Viral" />
                  </div>
                </div>
                <ViralityChart values={chartValues} avgViews={avgViews30d} />
                <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                  <span>30 dagar sedan</span>
                  <span>Idag</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-accent">Datadrivet</p>
              <h2 className="font-serif-display text-3xl font-bold leading-tight md:text-4xl">
                Vi räknar på det som faktiskt betyder något
              </h2>
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-foreground/85">
                <p>
                  Bra snitt-visningar är trevligt, men berättar inte hela historien. Det viktiga är vilka{" "}
                  <em>signaler</em> ni skickar ut — att verksamheten känns genomtänkt, schysst och värd ett besök. Det
                  syns i klippning, tajming och i hur en feed hänger ihop.
                </p>
                <p>
                  <strong>Genombrott</strong> mäter hur ofta ni når långt utanför era följare. Med 200 följare kan ett
                  klipp ändå landa på 100k+. Sker det regelbundet börjar nya människor bygga en känsla för er — och med
                  tiden en relation.
                </p>
                <p>
                  <strong>Like rate</strong> är ingen dålig metric. Får ni sällan likes slutar algoritmen pusha er. Det
                  säger något om hur engagerande, välproducerat och rätt-i-tiden innehållet är.
                </p>
                <p className="text-xs text-muted-foreground">
                  Siffrorna ovan hämtas från ert konto och uppdateras löpande när ni är kund.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PITCH ═══ */}
      <section className="border-b-2 border-foreground py-16">
        <div className="container mx-auto grid max-w-5xl gap-6 px-6 md:grid-cols-3">
          {[
            {
              icon: <Sparkles className="h-5 w-5" />,
              title: "Kurerat, inte slumpat",
              body: "Vi väljer koncept som passar er ton, era kunder och vad som faktiskt fungerar i ert format just nu.",
              bg: "bg-gold/40",
            },
            {
              icon: <TrendingUp className="h-5 w-5" />,
              title: "Likes per visning",
              body: "Vi mäter engagemang i djup, inte bara räckvidd. Bra signaler bygger relation över tid.",
              bg: "bg-mint",
            },
            {
              icon: <Calendar className="h-5 w-5" />,
              title: "Plattform + guidning",
              body: "Ni får en plan att jobba mot, inte bara tips. Mobilen räcker — vi hjälper er hela vägen.",
              bg: "bg-lavender",
            },
          ].map((b) => (
            <div key={b.title} className={`rounded-2xl border-2 border-foreground ${b.bg} p-6 shadow-hard-sm`}>
              <div className="flex items-center gap-2 text-foreground">
                {b.icon}
                <h3 className="text-sm font-bold uppercase tracking-wider">{b.title}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-foreground/80">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ EDITING APP ═══ */}
      <section className="border-b-2 border-foreground bg-secondary/40 py-16 md:py-20">
        <div className="container mx-auto grid max-w-5xl items-center gap-10 px-6 md:grid-cols-[5fr_6fr] md:gap-14">
          <div className="flex justify-center">
            <img
              src={appMockImg}
              alt="Förhandsvisning av LeTrend Auto-clip-appen"
              loading="lazy"
              className="w-full max-w-[360px] drop-shadow-xl"
            />
          </div>

          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-accent">
              <Wand2 className="h-3 w-3" /> Kommer i abonnemanget
            </div>
            <h2 className="mt-3 font-serif-display text-3xl font-bold md:text-4xl">
              Spela in scenerna — appen gör resten
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-foreground/85 md:text-base">
              <p>
                Vi arbetar på en mobilapp som guidar er genom processen att spela in. Ni spelar in med mobilen — vilket
                tar bort kostnaden för produktion — och appen gör resten.
              </p>
              <p className="text-sm text-muted-foreground">
                Har ni en bra mick och en mobil med bra inspelning är det ett plus. Annars riskerar innehållet upplevas
                mindre proffsigt.
              </p>
            </div>

            <ul className="mt-5 space-y-3 text-sm text-foreground">
              <li className="flex gap-3">
                <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span>Scen-baserad inspelning kopplad till varje koncept i feedplanen.</span>
              </li>
              <li className="flex gap-3">
                <Scissors className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span>
                  Automatisk klippning enligt format som fungerar på TikTok just nu — med stöd för trendljud, skärmtext
                  och annat.
                </span>
              </li>
              <li className="flex gap-3">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span>Behöver ni mer hjälp? Klippning, samarbeten och produktion finns som byrå-tillägg.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ═══ UGC / BYRÅSAMARBETEN ═══ */}
      <section className="border-b-2 border-foreground bg-gold/20 py-16 md:py-20">
        <div className="container mx-auto max-w-5xl px-6">
          <div className="grid items-stretch gap-10 md:grid-cols-[5fr_6fr] md:gap-14">
            <div className="flex flex-col">
              <div className="inline-flex w-fit items-center gap-2 rounded-full bg-foreground/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-foreground">
                <Handshake className="h-3 w-3" /> Byrå-tillägg
              </div>
              <h2 className="mt-3 font-serif-display text-3xl font-bold leading-tight md:text-4xl">
                Samarbeten med UGC-kreatörer
              </h2>
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-foreground/85 md:text-base">
                <p>
                  Ibland räcker inte er egen feed. När ni vill nå nya målgrupper matchar vi er med UGC-kreatörer som
                  passar tonen, branschen och budgeten.
                </p>
                <p>
                  LeTrend hanterar hela dialogen — från första kontakt till brief, leverans och betalning. Ni godkänner
                  samarbetet, vi sköter resten.
                </p>
                <p>
                  Tjänsten är ett tillägg till abonnemanget och faktureras per samarbete. Behöver ni en kreatör i
                  månaden eller en kampanj per kvartal — ni bestämmer takten.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border-2 border-foreground bg-card p-5 shadow-hard">
              <div className="mb-3 flex items-center justify-between">
                <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-accent">
                  <Sparkles className="h-3 w-3" /> Nytt samarbete
                </div>
                <span className="rounded-full bg-mint px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-foreground">
                  Förslag
                </span>
              </div>

              <div className="flex items-center gap-4 border-b-2 border-dashed border-foreground/15 pb-4">
                <img
                  src={creatorEmmaImg}
                  alt="Emma, UGC-kreatör"
                  loading="lazy"
                  className="h-16 w-16 rounded-full border-2 border-foreground object-cover"
                />
                <div>
                  <div className="font-serif-display text-lg font-bold leading-tight">Emma Lindqvist</div>
                  <div className="text-xs text-muted-foreground">@emmilq · 28k följare · Mat & livsstil</div>
                  <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-foreground/70">
                    <Star className="h-3 w-3 fill-gold text-gold" /> 4,9 · snitt 18k visningar
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2 text-sm text-foreground/85">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span>Medverka i video</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span>Skriva sketch / manus</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span>Producera & regissera</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 border-t-2 border-dashed border-foreground/15 pt-4 text-xs">
                <div>
                  <p className="font-bold uppercase tracking-widest text-muted-foreground">Datum</p>
                  <p className="mt-1 text-sm text-foreground">28 feb</p>
                </div>
                <div>
                  <p className="font-bold uppercase tracking-widest text-muted-foreground">Pris</p>
                  <p className="mt-1 text-sm font-bold text-foreground">3 500 kr</p>
                </div>
              </div>

              <div className="mt-4 text-[11px] text-muted-foreground">
                LeTrend sköter dialogen. Ni klickar bekräfta när ni är nöjda.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="border-b-2 border-foreground py-16 text-center">
        <div className="container mx-auto max-w-3xl px-6">
          <h2 className="font-serif-display text-3xl font-bold md:text-4xl">
            Vill ni veta mer om hur LeTrend fungerar?
          </h2>
          <p className="mt-4 text-muted-foreground">
            Boka ett kort samtal så går vi igenom planen för {demo.companyName} och svarar på era frågor.
          </p>
          <a
            href={`mailto:hej@letrend.se?subject=${mailSubject}&body=${mailBody}`}
            className="mt-8 inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-foreground px-8 py-3 text-sm font-bold uppercase tracking-wider text-background shadow-hard transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-hard-sm active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
          >
            <MessageCircle className="h-4 w-4" />
            Boka samtal
          </a>
          <div className="mt-3 text-[11px] text-muted-foreground">
            Eller svara direkt på mailet ni fick — vi återkopplar inom 1 arbetsdag.
          </div>
        </div>
      </section>

      <footer className="py-8 text-center text-xs text-muted-foreground">
        © LeTrend · Demo förberedd för {demo.companyName}
      </footer>
    </main>
  );
}

function Legend({ swatchClass, label }: { swatchClass: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-2 py-0.5">
      <span className={`h-2 w-2 rounded-full ${swatchClass}`} />
      <span className="text-foreground/80">{label}</span>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-hard-sm">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 font-serif-display text-2xl font-bold leading-none">{value}</p>
      <p className="mt-1.5 text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

const FALLBACK_BARS = [
  900, 1400, 2200, 1800, 3400, 1100, 2600, 1900, 1500, 4200,
  2100, 980, 3100, 1700, 5800, 2400, 1300, 22000, 1900, 2800,
  1500, 4400, 1100, 2300, 1700, 3500, 2100, 980, 1900, 2600,
];

function ViralityChart({ values, avgViews }: { values: number[] | null; avgViews: number | null }) {
  const bars = values && values.length === 30 ? values : FALLBACK_BARS;
  const max = Math.max(...bars, 1000);
  const hitLine = avgViews != null ? avgViews * 10 : null;
  const viralLine = avgViews != null ? avgViews * 20 : null;

  return (
    <div className="relative flex h-32 items-end gap-[3px]">
      {bars.map((v, i) => {
        const h = Math.min(100, (v / max) * 100);
        const tier =
          viralLine != null && v >= viralLine
            ? "bg-brand"
            : hitLine != null && v >= hitLine
              ? "bg-gold"
              : "bg-accent";
        return (
          <div key={i} className={`flex-1 rounded-t-sm ${tier}`} style={{ height: `${Math.max(4, h)}%` }} aria-hidden />
        );
      })}
      {hitLine != null && hitLine < max && (
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-gold/60"
          style={{ bottom: `${Math.min(98, (hitLine / max) * 100)}%` }}
          title={`Hit-gräns: ${hitLine.toLocaleString("sv-SE")}`}
        />
      )}
      {viralLine != null && viralLine < max && (
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-brand/60"
          style={{ bottom: `${Math.min(98, (viralLine / max) * 100)}%` }}
          title={`Viral-gräns: ${viralLine.toLocaleString("sv-SE")}`}
        />
      )}
    </div>
  );
}
