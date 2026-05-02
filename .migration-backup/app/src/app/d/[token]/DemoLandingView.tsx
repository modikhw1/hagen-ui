'use client';

import {
  Sparkles,
  TrendingUp,
  Calendar,
  MessageCircle,
  Scissors,
  Smartphone,
  Users,
  Wand2,
} from 'lucide-react';

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

export function DemoLandingView({ demo }: { demo: DemoData }) {
  const items = extractFeedItems(demo.preliminary_feedplan);
  const grid = Array.from({ length: 9 }, (_, i) => items[i] ?? null);
  const greeting = demo.contact_name ? `Hej ${demo.contact_name},` : 'Välkommen,';
  const conceptsPerWeek = demo.proposed_concepts_per_week ?? 2;
  const mailSubject = encodeURIComponent(`Demo för ${demo.company_name}`);
  const mailBody = encodeURIComponent(
    `Hej LeTrend,\n\nVi tittade på demoförslaget för ${demo.company_name} och vill höra mer.\n\n`,
  );

  return (
    <main
      className="min-h-screen"
      style={{
        background: '#FAF8F5',
        color: '#1A1612',
        fontFamily: "'DM Sans', -apple-system, sans-serif",
      }}
    >
      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pt-16 pb-10">
        <div className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: '#8B6914' }}>
          LeTrend · Demo för {demo.company_name}
        </div>
        <h1
          className="mt-4 text-4xl font-bold leading-tight md:text-5xl"
          style={{ fontFamily: 'Georgia, serif', color: '#4A2F18' }}
        >
          {greeting}<br />
          så här tänker vi för er.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed" style={{ color: '#5D4D3D' }}>
          LeTrend är en kurerad innehållstjänst — vi kombinerar strategi, format­förståelse och
          en plattform som guidar er produktion vecka för vecka. Nedan ser ni ett första utkast
          för {demo.company_name}: {conceptsPerWeek} koncept i veckan, anpassade
          till er bransch, ton och era egna styrkor.
        </p>
      </section>

      {/* Feed grid 3x3 */}
      <section className="mx-auto max-w-4xl px-6 pb-14">
        <div className="mb-4 flex items-center justify-between">
          <h2
            className="text-lg font-semibold"
            style={{ fontFamily: 'Georgia, serif', color: '#4A2F18' }}
          >
            Föreslagen feed-plan
          </h2>
          <span className="text-xs" style={{ color: '#7D6E5D' }}>
            LeT = vår kurering · TT = från er TikTok-historik
          </span>
        </div>

        {items.length === 0 ? (
          <div
            className="rounded-xl border p-10 text-center"
            style={{ borderColor: 'rgba(74,47,24,0.12)', background: '#FFFFFF', color: '#7D6E5D' }}
          >
            <Sparkles className="mx-auto mb-3 h-6 w-6" style={{ color: '#8B6914' }} />
            <div className="text-sm">Demot förbereds — feedplanen läggs in inom kort.</div>
          </div>
        ) : (
          <div className="relative">
            <div className="grid grid-cols-3 gap-2.5">
              {grid.map((item, idx) => (
                <div
                  key={idx}
                  className="relative aspect-[9/16] rounded-lg border p-3 transition-transform hover:-translate-y-0.5"
                  style={{
                    borderColor: 'rgba(74,47,24,0.1)',
                    background: item ? '#FFFFFF' : '#F5F2EE',
                  }}
                >
                  {item ? (
                    <div className="flex h-full flex-col">
                      <span
                        className="self-start rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                        style={{
                          background: item.source === 'tiktok' ? 'rgba(139,115,85,0.15)' : 'rgba(139,105,20,0.15)',
                          color: item.source === 'tiktok' ? '#5D3A1A' : '#8B6914',
                        }}
                      >
                        {item.source === 'tiktok' ? 'TT' : 'LeT'}
                      </span>
                      <div className="mt-2 flex-1 text-[11px] leading-snug" style={{ color: '#4A4239' }}>
                        {item.title || item.description || '—'}
                      </div>
                      {item.tag ? (
                        <span className="mt-1 text-[10px]" style={{ color: '#9D8E7D' }}>
                          #{item.tag}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs" style={{ color: '#9D8E7D' }}>
              Varje ruta = ett koncept (idé/video). I planeringsverktyget grupperas koncepten i
              kampanjer med taggar och tidsperiod — så att rätt budskap landar i rätt vecka.
            </p>
          </div>
        )}
      </section>

      {/* Pitch */}
      <section
        className="border-y py-12"
        style={{ borderColor: 'rgba(74,47,24,0.08)', background: '#F7F2EC' }}
      >
        <div className="mx-auto grid max-w-4xl gap-6 px-6 md:grid-cols-3">
          {[
            {
              icon: <Sparkles className="h-5 w-5" />,
              title: 'Kurerat, inte slumpat',
              body: 'Vi väljer koncept som passar er ton, era kunder och vad som faktiskt fungerar i ert format just nu.',
            },
            {
              icon: <TrendingUp className="h-5 w-5" />,
              title: 'Likes per visning',
              body: 'Vi mäter engagemang i djup, inte bara räckvidd. Bra signaler bygger relation över tid.',
            },
            {
              icon: <Calendar className="h-5 w-5" />,
              title: 'Plattform + guidning',
              body: 'Ni får en plan att jobba mot, inte bara tips. Mobilen räcker — vi hjälper er hela vägen.',
            },
          ].map((b) => (
            <div key={b.title}>
              <div className="flex items-center gap-2" style={{ color: '#8B6914' }}>
                {b.icon}
                <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: '#4A2F18' }}>
                  {b.title}
                </h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: '#5D4D3D' }}>
                {b.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* So här jobbar vi */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <h2
          className="text-2xl font-bold"
          style={{ fontFamily: 'Georgia, serif', color: '#4A2F18' }}
        >
          Så här jobbar vi tillsammans
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: '#5D4D3D' }}>
          En byrås strategiska tänk, levererat genom en plattform som gör det enkelt att producera
          rätt sak i rätt vecka.
        </p>

        <ol className="mt-8 grid gap-5 md:grid-cols-2">
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
              body: 'Vi analyserar innehåll och söker globala trender — så ni får chansen att synas innan andra hinner reagera.',
            },
            {
              n: '04',
              title: 'Mätning som betyder något',
              body: 'Likes per visning visar djup i engagemanget. Det är så vi vet om innehållet bygger relation, inte bara räckvidd.',
            },
          ].map((s) => (
            <li
              key={s.n}
              className="rounded-lg border p-5"
              style={{ borderColor: 'rgba(74,47,24,0.1)', background: '#FFFFFF' }}
            >
              <div className="text-xs font-bold tracking-widest" style={{ color: '#8B6914' }}>
                {s.n}
              </div>
              <h3 className="mt-1 text-base font-semibold" style={{ color: '#4A2F18' }}>
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: '#5D4D3D' }}>
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* Editing app + agency support */}
      <section
        className="border-y py-16"
        style={{ borderColor: 'rgba(74,47,24,0.08)', background: '#F2EBE2' }}
      >
        <div className="mx-auto grid max-w-4xl items-center gap-10 px-6 md:grid-cols-2">
          {/* iPhone mockup */}
          <div className="flex justify-center">
            <div
              className="relative h-[420px] w-[210px] rounded-[40px] border-[10px] p-2 shadow-2xl"
              style={{ borderColor: '#1A1612', background: '#1A1612' }}
            >
              <div
                className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full"
                style={{ background: '#1A1612' }}
              />
              <div
                className="flex h-full w-full flex-col items-center justify-between rounded-[28px] p-5"
                style={{
                  background:
                    'linear-gradient(160deg, #4A2F18 0%, #8B6914 60%, #C9A961 100%)',
                }}
              >
                <div className="pt-6 text-center">
                  <div
                    className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl"
                    style={{ background: 'rgba(255,255,255,0.15)' }}
                  >
                    <span
                      className="text-2xl font-bold"
                      style={{ fontFamily: 'Georgia, serif', color: '#FAF8F5' }}
                    >
                      LeT
                    </span>
                  </div>
                  <div
                    className="mt-3 text-[11px] font-semibold uppercase tracking-widest"
                    style={{ color: 'rgba(250,248,245,0.8)' }}
                  >
                    Auto-clip
                  </div>
                </div>
                <div className="w-full space-y-2">
                  {['Scen 01 · Hook', 'Scen 02 · Visa', 'Scen 03 · Avslut'].map((s, i) => (
                    <div
                      key={s}
                      className="flex items-center justify-between rounded-lg px-3 py-2 text-[11px]"
                      style={{
                        background: 'rgba(250,248,245,0.12)',
                        color: '#FAF8F5',
                      }}
                    >
                      <span>{s}</span>
                      <span style={{ color: i === 0 ? '#C9A961' : 'rgba(250,248,245,0.5)' }}>
                        {i === 0 ? '● REC' : '○'}
                      </span>
                    </div>
                  ))}
                </div>
                <div
                  className="mb-1 w-full rounded-lg py-2 text-center text-[11px] font-semibold"
                  style={{ background: '#FAF8F5', color: '#4A2F18' }}
                >
                  Klipp ihop automatiskt
                </div>
              </div>
            </div>
          </div>

          {/* Copy */}
          <div>
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
              style={{ background: 'rgba(139,105,20,0.15)', color: '#8B6914' }}
            >
              <Wand2 className="h-3 w-3" /> Kommer i abonnemanget
            </div>
            <h2
              className="mt-3 text-2xl font-bold"
              style={{ fontFamily: 'Georgia, serif', color: '#4A2F18' }}
            >
              Spela in scenerna — vi klipper resten
            </h2>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: '#5D4D3D' }}>
              Vår kommande mobilapp guidar er genom varje scen i ett koncept. Ni spelar in det
              som krävs, appen klipper ihop till en färdig video. Mindre friktion, mer publicering.
            </p>

            <ul className="mt-5 space-y-3 text-sm" style={{ color: '#4A2F18' }}>
              <li className="flex gap-3">
                <Smartphone className="mt-0.5 h-4 w-4 shrink-0" style={{ color: '#8B6914' }} />
                <span>Scen-baserad inspelning kopplad till varje koncept i feed-planen.</span>
              </li>
              <li className="flex gap-3">
                <Scissors className="mt-0.5 h-4 w-4 shrink-0" style={{ color: '#8B6914' }} />
                <span>Automatisk klippning enligt format som fungerar på TikTok just nu.</span>
              </li>
              <li className="flex gap-3">
                <Users className="mt-0.5 h-4 w-4 shrink-0" style={{ color: '#8B6914' }} />
                <span>
                  Behöver ni mer hjälp? Klippning, samarbeten och produktion finns som
                  byrå-tillägg.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl px-6 py-14 text-center">
        <h2 className="text-2xl font-bold" style={{ fontFamily: 'Georgia, serif', color: '#4A2F18' }}>
          Vill ni se hur det här skulle fungera i praktiken?
        </h2>
        <p className="mt-3 text-sm" style={{ color: '#5D4D3D' }}>
          Boka ett kort samtal så går vi igenom planen för {demo.company_name} och svarar på era
          frågor.
        </p>
        <a
          href={`mailto:hej@letrend.se?subject=${mailSubject}&body=${mailBody}`}
          className="mt-6 inline-flex items-center gap-2 rounded-md px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: '#4A2F18', color: '#FAF8F5' }}
        >
          <MessageCircle className="h-4 w-4" />
          Boka samtal
        </a>
        <div className="mt-3 text-[11px]" style={{ color: '#9D8E7D' }}>
          Eller svara direkt på mailet ni fick — vi återkopplar inom 1 arbetsdag.
        </div>
      </section>

      <footer className="pb-8 text-center text-xs" style={{ color: '#9D8E7D' }}>
        © LeTrend · Demo förberedd för {demo.company_name}
      </footer>
    </main>
  );
}