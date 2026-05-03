'use client';

import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  MessageCircle,
  Scissors,
  Smartphone,
  Sparkles,
  TrendingUp,
  Users,
  Wand2,
} from 'lucide-react';
import type { ReactNode } from 'react';

type FeedplanItem = {
  title?: string;
  description?: string;
  source?: 'letrend' | 'tiktok' | string;
  tag?: string;
};

type DemoData = {
  id: string;
  company_name: string;
  contact_name: string | null;
  tiktok_handle: string | null;
  tiktok_profile_pic_url: string | null;
  proposed_concepts_per_week: number | null;
  preliminary_feedplan: unknown;
  status: string;
};

function extractFeedItems(plan: unknown): FeedplanItem[] {
  if (!plan) return [];
  if (Array.isArray(plan)) return plan as FeedplanItem[];
  if (typeof plan === 'object' && plan !== null) {
    const items = (plan as { items?: unknown }).items;
    if (Array.isArray(items)) return items as FeedplanItem[];
  }
  return [];
}

const palette = {
  cream: '#FAF6EE',
  paper: '#FFFFFF',
  ink: '#1F1A14',
  brand: '#3D2817',
  gold: '#C9A961',
  goldDeep: '#8B6914',
  blush: '#F4D8C4',
  sage: '#B8C9A8',
  borderSoft: 'rgba(31,26,20,0.12)',
  textMuted: '#7D6E5D',
  textBody: '#3D352B',
} as const;

const shadowHard = '4px 4px 0 0 #1F1A14';
const shadowHardSmall = '2px 2px 0 0 #1F1A14';

export function DemoLandingView({ demo }: { demo: DemoData }) {
  const items = extractFeedItems(demo.preliminary_feedplan);
  const grid = Array.from({ length: 9 }, (_, i) => items[i] ?? null);
  const greeting = demo.contact_name ? `Hej ${demo.contact_name},` : `Hej ${demo.company_name},`;
  const conceptsPerWeek = demo.proposed_concepts_per_week ?? 2;
  const mailSubject = encodeURIComponent(`Demo för ${demo.company_name}`);
  const mailBody = encodeURIComponent(
    `Hej LeTrend,\n\nVi tittade på demoförslaget för ${demo.company_name} och vill höra mer.\n\n`,
  );

  return (
    <main
      className="min-h-screen"
      style={{
        background: palette.cream,
        color: palette.ink,
        fontFamily: "'DM Sans', -apple-system, system-ui, sans-serif",
      }}
    >
      <section
        className="relative overflow-hidden border-b-2 py-20 md:py-28"
        style={{ borderColor: palette.ink, background: palette.brand, color: palette.cream }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-[0.06]" aria-hidden>
          <div
            className="absolute -right-20 -top-20 h-72 w-72 rounded-full"
            style={{ background: palette.gold }}
          />
          <div
            className="absolute -bottom-32 left-10 h-56 w-56 rounded-full"
            style={{ background: palette.blush }}
          />
        </div>

        <div className="container relative z-10 mx-auto max-w-4xl px-6">
          <p
            className="mb-5 text-xs font-bold uppercase tracking-[0.25em]"
            style={{ color: palette.gold }}
          >
            LeTrend · Demo för {demo.company_name}
          </p>
          <h1
            className="text-4xl font-black leading-[1.05] md:text-6xl"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            {greeting}
            <br />
            så här tänker vi för er.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed opacity-80 md:text-lg">
            LeTrend är en kurerad innehållstjänst - vi kombinerar strategi, formatförståelse och en
            plattform som guidar er produktion vecka för vecka. Nedan ser ni ett första utkast för{' '}
            {demo.company_name}: <strong style={{ color: palette.gold }}>{conceptsPerWeek} koncept i veckan</strong>,
            anpassade till er bransch, ton och era egna styrkor.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <StatChip label="Koncept / vecka" value={String(conceptsPerWeek)} />
            <StatChip label="Plattform + kuratering" value="Inkluderat" />
            <StatChip label="Mätning" value="Likes / visning" />
          </div>
        </div>
      </section>

      <section
        className="border-b-2 py-16 md:py-20"
        style={{ borderColor: palette.ink, background: palette.cream }}
      >
        <div className="container mx-auto max-w-4xl px-6">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p
                className="mb-2 text-xs font-bold uppercase tracking-widest"
                style={{ color: palette.goldDeep }}
              >
                Föreslagen feed-plan
              </p>
              <h2
                className="text-2xl font-black md:text-3xl"
                style={{ fontFamily: 'Georgia, serif', color: palette.brand }}
              >
                De första 9 koncepten för {demo.company_name}
              </h2>
            </div>
            <div className="flex items-center gap-3 text-xs" style={{ color: palette.textMuted }}>
              <span className="flex items-center gap-1.5">
                <Pill bg={palette.gold} ink={palette.ink}>LeT</Pill> kurering
              </span>
              <span className="flex items-center gap-1.5">
                <Pill bg={palette.blush} ink={palette.ink}>TT</Pill> er historik
              </span>
            </div>
          </div>

          {items.length === 0 ? (
            <div
              className="rounded-2xl border-2 p-12 text-center shadow-[4px_4px_0_0_rgba(31,26,20,0.15)]"
              style={{
                borderColor: palette.ink,
                background: palette.paper,
                color: palette.textMuted,
              }}
            >
              <Sparkles className="mx-auto mb-3 h-7 w-7" style={{ color: palette.goldDeep }} />
              <div className="text-sm font-medium">
                Demot förbereds - feedplanen läggs in inom kort.
              </div>
            </div>
          ) : (
            <div>
              <div
                className="rounded-2xl border-2 p-3 md:p-4"
                style={{ borderColor: palette.ink, background: palette.paper, boxShadow: shadowHard }}
              >
                <div className="grid grid-cols-3 gap-2 md:gap-3">
                  {grid.map((item, idx) => {
                    const isTikTok = item?.source === 'tiktok';
                    return (
                      <div
                        key={idx}
                        className="relative aspect-[9/16] rounded-lg border-2 p-2.5 transition-transform hover:-translate-y-0.5 md:p-3"
                        style={{
                          borderColor: item ? palette.ink : palette.borderSoft,
                          background: item
                            ? isTikTok
                              ? '#FFF8F2'
                              : '#FFFAEC'
                            : 'rgba(31,26,20,0.03)',
                        }}
                      >
                        {item ? (
                          <div className="flex h-full flex-col">
                            <Pill bg={isTikTok ? palette.blush : palette.gold} ink={palette.ink}>
                              {isTikTok ? 'TT' : 'LeT'}
                            </Pill>
                            <div
                              className="mt-2 flex-1 text-[11px] font-medium leading-snug md:text-xs"
                              style={{ color: palette.textBody }}
                            >
                              {item.title || item.description || '—'}
                            </div>
                            {item.tag ? (
                              <span
                                className="mt-1 truncate text-[10px] font-semibold"
                                style={{ color: palette.goldDeep }}
                              >
                                #{item.tag}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <div
                            className="flex h-full items-center justify-center text-[10px] font-medium"
                            style={{ color: palette.textMuted }}
                          >
                            —
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="mt-4 text-xs leading-relaxed" style={{ color: palette.textMuted }}>
                Varje ruta = ett koncept (idé/video). I planeringsverktyget grupperas koncepten i
                kampanjer med taggar och tidsperiod - så att rätt budskap landar i rätt vecka.
              </p>
            </div>
          )}
        </div>
      </section>

      <section
        className="border-b-2 py-16 md:py-20"
        style={{ borderColor: palette.ink, background: palette.blush }}
      >
        <div className="container mx-auto max-w-4xl px-6">
          <div className="mb-10 max-w-2xl">
            <p
              className="mb-2 text-xs font-bold uppercase tracking-widest"
              style={{ color: palette.brand }}
            >
              Vad gör oss annorlunda
            </p>
            <h2
              className="text-3xl font-black md:text-4xl"
              style={{ fontFamily: 'Georgia, serif', color: palette.brand }}
            >
              En byrås tänk, en plattforms tempo.
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                icon: <Sparkles className="h-5 w-5" />,
                title: 'Kurerat, inte slumpat',
                body: 'Vi väljer koncept som passar er ton, era kunder och vad som faktiskt fungerar i ert format just nu.',
                bg: palette.paper,
              },
              {
                icon: <TrendingUp className="h-5 w-5" />,
                title: 'Likes per visning',
                body: 'Vi mäter engagemang i djup, inte bara räckvidd. Bra signaler bygger relation över tid.',
                bg: palette.cream,
              },
              {
                icon: <Calendar className="h-5 w-5" />,
                title: 'Plattform + guidning',
                body: 'Ni får en plan att jobba mot, inte bara tips. Mobilen räcker - vi hjälper er hela vägen.',
                bg: palette.paper,
              },
            ].map((block) => (
              <div
                key={block.title}
                className="rounded-2xl border-2 p-6"
                style={{
                  borderColor: palette.ink,
                  background: block.bg,
                  boxShadow: shadowHard,
                }}
              >
                <div
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border-2"
                  style={{ borderColor: palette.ink, background: palette.gold, color: palette.ink }}
                >
                  {block.icon}
                </div>
                <h3 className="mt-4 text-lg font-bold" style={{ color: palette.brand }}>
                  {block.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: palette.textBody }}>
                  {block.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        className="border-b-2 py-16 md:py-24"
        style={{ borderColor: palette.ink, background: palette.cream }}
      >
        <div className="container mx-auto max-w-4xl px-6">
          <div className="mb-10 max-w-2xl">
            <p
              className="mb-2 text-xs font-bold uppercase tracking-widest"
              style={{ color: palette.goldDeep }}
            >
              Så jobbar vi
            </p>
            <h2
              className="text-3xl font-black md:text-4xl"
              style={{ fontFamily: 'Georgia, serif', color: palette.brand }}
            >
              Från strategi till publicering - varje vecka.
            </h2>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: palette.textBody }}>
              En byrås strategiska tänk, levererat genom en plattform som gör det enkelt att
              producera rätt sak i rätt vecka.
            </p>
          </div>

          <ol className="grid gap-4 md:grid-cols-2">
            {[
              {
                n: '01',
                title: 'Vi sätter strategin',
                body: 'Ert varumärke, era mål och er ton blir grunden. Vi anpassar antal koncept i veckan efter vad som är realistiskt och vad TikTok-formatet kräver.',
              },
              {
                n: '02',
                title: 'Plattformen guidar veckan',
                body: 'Varje koncept kommer med syfte, format-tips och referens. Ni öppnar appen och vet vad som ska spelas in.',
              },
              {
                n: '03',
                title: 'AI hjälper i bakgrunden',
                body: 'Vi analyserar innehåll och söker globala trender - så ni får chansen att synas innan andra hinner reagera.',
              },
              {
                n: '04',
                title: 'Mätning som betyder något',
                body: 'Likes per visning visar djup i engagemanget. Det är så vi vet om innehållet bygger relation, inte bara räckvidd.',
              },
            ].map((step) => (
              <li
                key={step.n}
                className="rounded-2xl border-2 p-6"
                style={{ borderColor: palette.ink, background: palette.paper, boxShadow: shadowHardSmall }}
              >
                <div
                  className="inline-flex h-9 items-center justify-center rounded-md border-2 px-2.5 text-sm font-black tracking-wider"
                  style={{ borderColor: palette.ink, background: palette.gold, color: palette.ink }}
                >
                  {step.n}
                </div>
                <h3 className="mt-3 text-lg font-bold" style={{ color: palette.brand }}>
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: palette.textBody }}>
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        className="border-b-2 py-16 md:py-24"
        style={{ borderColor: palette.ink, background: palette.sage }}
      >
        <div className="container mx-auto grid max-w-4xl items-center gap-10 px-6 md:grid-cols-2">
          <div className="flex justify-center">
            <div
              className="relative h-[460px] w-[230px] rounded-[44px] border-[12px] p-2"
              style={{
                borderColor: palette.ink,
                background: palette.ink,
                boxShadow: '8px 8px 0 0 #1F1A14',
              }}
            >
              <div
                className="absolute left-1/2 top-2.5 z-10 h-5 w-24 -translate-x-1/2 rounded-full"
                style={{ background: palette.ink }}
              />
              <div
                className="flex h-full w-full flex-col items-center justify-between rounded-[30px] p-5"
                style={{
                  background: `linear-gradient(160deg, ${palette.brand} 0%, ${palette.goldDeep} 60%, ${palette.gold} 100%)`,
                }}
              >
                <div className="pt-6 text-center">
                  <div
                    className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-2"
                    style={{
                      background: 'rgba(255,255,255,0.18)',
                      borderColor: 'rgba(255,255,255,0.3)',
                    }}
                  >
                    <span
                      className="text-2xl font-black"
                      style={{ fontFamily: 'Georgia, serif', color: palette.cream }}
                    >
                      LeT
                    </span>
                  </div>
                  <div
                    className="mt-3 text-[10px] font-bold uppercase tracking-[0.2em]"
                    style={{ color: 'rgba(250,246,238,0.85)' }}
                  >
                    Auto-clip
                  </div>
                </div>
                <div className="w-full space-y-2">
                  {[
                    { label: 'Scen 01 · Hook', state: '● REC' },
                    { label: 'Scen 02 · Visa', state: '○' },
                    { label: 'Scen 03 · Avslut', state: '○' },
                  ].map((scene, index) => (
                    <div
                      key={scene.label}
                      className="flex items-center justify-between rounded-lg px-3 py-2 text-[11px] font-medium"
                      style={{
                        background: 'rgba(250,246,238,0.14)',
                        color: palette.cream,
                        border: index === 0 ? '1px solid rgba(201,169,97,0.6)' : '1px solid transparent',
                      }}
                    >
                      <span>{scene.label}</span>
                      <span style={{ color: index === 0 ? palette.gold : 'rgba(250,246,238,0.5)' }}>
                        {scene.state}
                      </span>
                    </div>
                  ))}
                </div>
                <div
                  className="mb-1 w-full rounded-lg border-2 py-2.5 text-center text-[11px] font-bold"
                  style={{ background: palette.cream, color: palette.brand, borderColor: palette.ink }}
                >
                  Klipp ihop automatiskt
                </div>
              </div>
            </div>
          </div>

          <div>
            <div
              className="inline-flex items-center gap-2 rounded-full border-2 px-3 py-1 text-[10px] font-black uppercase tracking-widest"
              style={{ borderColor: palette.ink, background: palette.gold, color: palette.ink }}
            >
              <Wand2 className="h-3 w-3" /> Kommer i abonnemanget
            </div>
            <h2
              className="mt-4 text-3xl font-black"
              style={{ fontFamily: 'Georgia, serif', color: palette.brand }}
            >
              Spela in scenerna - vi klipper resten
            </h2>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: palette.textBody }}>
              Vår kommande mobilapp guidar er genom varje scen i ett koncept. Ni spelar in det som
              krävs, appen klipper ihop till en färdig video. Mindre friktion, mer publicering.
            </p>

            <ul className="mt-5 space-y-3 text-sm" style={{ color: palette.brand }}>
              {[
                {
                  icon: <Smartphone className="mt-0.5 h-4 w-4 shrink-0" />,
                  text: 'Scen-baserad inspelning kopplad till varje koncept i feed-planen.',
                },
                {
                  icon: <Scissors className="mt-0.5 h-4 w-4 shrink-0" />,
                  text: 'Automatisk klippning enligt format som fungerar på TikTok just nu.',
                },
                {
                  icon: <Users className="mt-0.5 h-4 w-4 shrink-0" />,
                  text: 'Behöver ni mer hjälp? Klippning, samarbeten och produktion finns som byrå-tillägg.',
                },
              ].map((item, index) => (
                <li key={index} className="flex gap-3">
                  <span style={{ color: palette.goldDeep }}>{item.icon}</span>
                  <span style={{ color: palette.textBody }}>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section
        className="border-b-2 py-16 md:py-20"
        style={{ borderColor: palette.ink, background: palette.gold }}
      >
        <div className="container mx-auto max-w-3xl px-6 text-center">
          <h2
            className="text-3xl font-black md:text-4xl"
            style={{ fontFamily: 'Georgia, serif', color: palette.ink }}
          >
            Vill ni se hur det här skulle fungera i praktiken?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed" style={{ color: palette.brand }}>
            Boka ett kort samtal så går vi igenom planen för {demo.company_name} och svarar på era
            frågor.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={`mailto:hej@letrend.se?subject=${mailSubject}&body=${mailBody}`}
              className="inline-flex items-center gap-2 rounded-full border-2 px-7 py-3 text-sm font-bold transition-all active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
              style={{
                borderColor: palette.ink,
                background: palette.ink,
                color: palette.cream,
                boxShadow: shadowHardSmall,
              }}
            >
              <MessageCircle className="h-4 w-4" />
              Boka samtal
              <ArrowRight className="h-4 w-4" />
            </a>
            <span className="text-xs font-medium" style={{ color: palette.brand }}>
              eller svara direkt på mailet ni fick - vi återkopplar inom 1 arbetsdag
            </span>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium" style={{ color: palette.brand }}>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Inga bindningar i samtalet
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Vi visar plattformen live
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> 30 minuter räcker
            </span>
          </div>
        </div>
      </section>

      <footer
        className="py-8 text-center text-xs font-medium"
        style={{ background: palette.cream, color: palette.textMuted }}
      >
        © LeTrend · Demo förberedd för {demo.company_name}
      </footer>
    </main>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-full border-2 px-4 py-1.5"
      style={{
        borderColor: 'rgba(250,246,238,0.3)',
        background: 'rgba(250,246,238,0.08)',
      }}
    >
      <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">{label}</span>
      <span className="ml-2 text-sm font-bold">{value}</span>
    </div>
  );
}

function Pill({
  bg,
  ink,
  children,
}: {
  bg: string;
  ink: string;
  children: ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center self-start rounded border-2 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider"
      style={{ background: bg, color: ink, borderColor: ink }}
    >
      {children}
    </span>
  );
}
