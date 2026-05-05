import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Handshake,
  MessageCircle,
  Mic,
  Scissors,
  Smartphone,
  Sparkles,
  TrendingUp,
  Users,
  Wand2,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { GamePlanDisplay } from '@/components/gameplan-editor/GamePlanDisplay';
import {
  CustomerPlannerGrid,
  type CustomerPlannerSlot,
} from '@/components/demo/CustomerPlannerGrid';

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

const palette = {
  cream: '#FAF8F5',
  paper: '#FFFFFF',
  ink: '#1F1A14',
  brown: '#4A2F18',
  brownSoft: '#6B4423',
  gold: '#C9A961',
  goldDeep: '#8B6914',
  blush: '#F4E4D8',
  sage: '#DCE6D5',
  mint: '#E6EFE5',
  line: 'rgba(74,47,24,0.12)',
  lineStrong: 'rgba(74,47,24,0.22)',
  textMuted: '#7D6E5D',
};

const sectionStyle = {
  borderBottom: `1px solid ${palette.lineStrong}`,
} satisfies CSSProperties;

export function DemoLandingView({ payload }: { payload: DemoPreviewPayload }) {
  const { demo, concepts } = payload;
  const slots = concepts;
  const greetingName = demo.contactName?.trim() || 'friend';
  const conceptsPerWeek = demo.proposedConceptsPerWeek ?? 2;
  const cmName = demo.contentManager?.name?.trim() || 'LeTrend';
  const mailSubject = encodeURIComponent(`Demo för ${demo.companyName}`);
  const mailBody = encodeURIComponent(
    `Hej LeTrend,\n\nVi tittade på demoförslaget för ${demo.companyName} och vill höra mer.\n\n`,
  );
  const priceLabel =
    typeof demo.proposedPriceOre === 'number'
      ?
       `${Math.round(demo.proposedPriceOre / 100).toLocaleString('sv-SE')} kr/mån`
      : 'Pris sätts efter scope';

  return (
    <main
      style={{
        minHeight: '100vh',
        background: palette.cream,
        color: palette.ink,
        fontFamily: 'var(--app-font-sans)',
      }}
    >
      <section
        style={{
          ...sectionStyle,
          position: 'relative',
          overflow: 'hidden',
          background: `linear-gradient(145deg, ${palette.brown} 0%, #2D1B0F 72%)`,
          color: palette.cream,
          padding: '88px 0 92px',
        }}
      >
        <Atmosphere />
        <div style={containerStyle(920)}>
          <p style={eyebrowStyle(palette.gold)}>LeTrend · Demo för {demo.companyName}</p>
          <h1
            style={{
              margin: 0,
              maxWidth: 780,
              fontFamily: 'var(--app-font-serif)',
              fontSize: 'clamp(42px, 7vw, 76px)',
              lineHeight: 0.98,
              letterSpacing: '-0.045em',
            }}
          >
            En kort interaktiv demo.
          </h1>
          <div
            style={{
              marginTop: 28,
              maxWidth: 720,
              display: 'grid',
              gap: 14,
              color: 'rgba(250,248,245,0.86)',
              fontSize: 17,
              lineHeight: 1.68,
            }}
          >
            <p style={{ margin: 0 }}>
              Hej {greetingName}. LeTrend är en marknadsföringstjänst för TikTok som kombinerar
              mänsklig kurering, ett tydligt veckoflöde och en plattform där ni ser vad som ska
              spelas in.
            </p>
            <p style={{ margin: 0 }}>
              Nedan visar vi hur er feed kan byggas: befintliga TikTok-signaler, kommande
              LeTrend-koncept och rekommenderad takt. För {demo.companyName} föreslår vi{' '}
              <strong style={{ color: palette.gold }}>{conceptsPerWeek} koncept i veckan</strong>.
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 32 }}>
            <StatChip label="Koncept / vecka" value={String(conceptsPerWeek)} />
            <StatChip label="Förslag" value={priceLabel} />
            <StatChip label="CM" value={cmName} />
          </div>
        </div>
      </section>

      <section style={{ ...sectionStyle, background: palette.blush, padding: '72px 0' }}>
        <div style={containerStyle(1100)}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 5fr) minmax(320px, 7fr)',
              gap: 56,
              alignItems: 'center',
            }}
            className="demo-preview-two-col"
          >
            <div>
              <p style={eyebrowStyle(palette.goldDeep)}>Feedplan</p>
              <h2 style={sectionHeadingStyle}>Så här skulle er feed kunna se ut</h2>
              <div style={bodyCopyStackStyle}>
                <p>
                  LeTrend arbetar med kreativt bricolage: vi tar format, trender och bevis från
                  verkliga klipp och gör dem användbara för ert varumärke.
                </p>
                <p>
                  Feeden nedan hämtar innehåll från er Studio-plan. Historik och reconcilade
                  TikTok-klipp används som bevis, medan kommande LeTrend-koncept visar vad som bör
                  produceras härnäst.
                </p>
                <p>
                  Hovra över rutorna för rubrik, varför konceptet fungerar och TikTok-länken när
                  den finns kopplad.
                </p>
              </div>
              <ContentManagerCard demo={demo} />
            </div>

            <div
              style={{
                maxWidth: 440,
                width: '100%',
                margin: '0 auto',
                border: `1px solid ${palette.lineStrong}`,
                background: 'rgba(255,255,255,0.54)',
                borderRadius: 28,
                padding: 16,
                boxShadow: '0 28px 60px rgba(74,47,24,0.16)',
              }}
            >
              <CustomerPlannerGrid slots={slots} companyName={demo.companyName} />
            </div>
          </div>
        </div>
      </section>

      <GamePlanSection demo={demo} />

      <MetricsSection demo={demo} conceptCount={slots.length} />

      <section style={{ ...sectionStyle, background: palette.paper, padding: '72px 0' }}>
        <div style={containerStyle(1000)}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 18,
            }}
            className="demo-preview-card-grid"
          >
            <ProofCard
              icon={<Sparkles size={20} />}
              title="Kurerat, inte slumpat"
              body="Koncepten väljs efter er ton, era resurser och vilka signaler som redan finns i er feed."
            />
            <ProofCard
              icon={<TrendingUp size={20} />}
              title="Snabbare än byråtempo"
              body="När en idé börjar röra sig kan den omsättas till ett kundanpassat koncept utan produktionstung startsträcka."
            />
            <ProofCard
              icon={<Calendar size={20} />}
              title="Planen styr veckan"
              body="Feed plannern gör det tydligt vad som är nu, vad som kommer sen och vad som redan har publicerats."
            />
          </div>
        </div>
      </section>

      <section style={{ ...sectionStyle, background: palette.sage, padding: '76px 0' }}>
        <div
          style={{
            ...containerStyle(980),
            display: 'grid',
            gridTemplateColumns: 'minmax(220px, 4fr) minmax(0, 5fr)',
            gap: 56,
            alignItems: 'center',
          }}
          className="demo-preview-two-col"
        >
          <PhoneMock />
          <div>
            <Pill>
              <Wand2 size={13} /> Kommer i abonnemanget
            </Pill>
            <h2 style={{ ...sectionHeadingStyle, marginTop: 16 }}>Spela in scenerna, vi klipper resten</h2>
            <div style={bodyCopyStackStyle}>
              <p>
                Mobilflödet är tänkt att guida er genom varje scen i ett koncept. Ni spelar in det
                som behövs, LeTrend hjälper med struktur, klippning och nästa steg.
              </p>
            </div>
            <FeatureList
              items={[
                { icon: <Smartphone size={16} />, text: 'Scenbaserad inspelning kopplad till feedplanen.' },
                { icon: <Scissors size={16} />, text: 'Tydligare produktion utan att köpa ett stort byråpaket.' },
                { icon: <Users size={16} />, text: 'Extra hjälp, UGC och samarbeten kan läggas till vid behov.' },
              ]}
            />
          </div>
        </div>
      </section>

      <section style={{ ...sectionStyle, background: 'rgba(201,169,97,0.22)', padding: '72px 0' }}>
        <div
          style={{
            ...containerStyle(980),
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 5fr) minmax(280px, 5fr)',
            gap: 42,
            alignItems: 'center',
          }}
          className="demo-preview-two-col"
        >
          <div>
            <Pill>
              <Handshake size={13} /> Byrå-tillägg
            </Pill>
            <h2 style={{ ...sectionHeadingStyle, marginTop: 16 }}>Samarbeten med UGC-kreatörer</h2>
            <div style={bodyCopyStackStyle}>
              <p>
                När er egen feed inte räcker kan LeTrend matcha er med kreatörer som passar tonen,
                branschen och budgeten.
              </p>
              <p>Ni godkänner samarbetet, vi hanterar brief, dialog, leverans och betalning.</p>
            </div>
          </div>
          <AgencyCard />
        </div>
      </section>

      <section style={{ padding: '76px 0 64px', background: palette.brown, color: palette.cream }}>
        <div style={{ ...containerStyle(780), textAlign: 'center' }}>
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--app-font-serif)',
              fontSize: 'clamp(30px, 5vw, 48px)',
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
            }}
          >
            Vill ni se hur det här fungerar i praktiken?
          </h2>
          <p style={{ margin: '18px auto 0', maxWidth: 560, color: 'rgba(250,248,245,0.76)', lineHeight: 1.65 }}>
            Boka ett kort samtal så går vi igenom planen för {demo.companyName} och visar hur
            Studio-flödet blir en konkret veckorutin.
          </p>
          <a
            href={`mailto:hej@letrend.se?subject=${mailSubject}&body=${mailBody}`}
            style={{
              marginTop: 30,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              borderRadius: 999,
              background: palette.cream,
              color: palette.brown,
              padding: '14px 22px',
              fontSize: 13,
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              textDecoration: 'none',
              boxShadow: '0 18px 35px rgba(0,0,0,0.22)',
            }}
          >
            <MessageCircle size={16} /> Boka samtal <ArrowRight size={16} />
          </a>
          <div style={{ marginTop: 22, display: 'flex', justifyContent: 'center', gap: 18, flexWrap: 'wrap', color: 'rgba(250,248,245,0.72)', fontSize: 12 }}>
            <InlineCheck>30 minuter räcker</InlineCheck>
            <InlineCheck>Vi visar plattformen live</InlineCheck>
            <InlineCheck>Ingen bindning i samtalet</InlineCheck>
          </div>
        </div>
      </section>

      <footer style={{ padding: 26, textAlign: 'center', color: palette.textMuted, fontSize: 12 }}>
        © LeTrend · Demo förberedd för {demo.companyName}
      </footer>
    </main>
  );
}

function Atmosphere() {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: 0.16 }}>
      <div style={{ position: 'absolute', right: -90, top: -90, width: 330, height: 330, borderRadius: '50%', background: palette.gold }} />
      <div style={{ position: 'absolute', left: '8%', bottom: -130, width: 260, height: 260, borderRadius: '50%', background: palette.blush }} />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,0.24) 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
    </div>
  );
}

function ContentManagerCard({ demo }: { demo: DemoPreviewPayload['demo'] }) {
  const cm = demo.contentManager;
  const initial = cm.name?.[0]?.toUpperCase() ?? 'L';
  return (
    <div
      style={{
        marginTop: 28,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        border: `1px solid ${palette.lineStrong}`,
        background: 'rgba(255,255,255,0.52)',
        borderRadius: 18,
        padding: 14,
      }}
    >
      {cm.avatarUrl ? (
        <img
          src={cm.avatarUrl}
          alt={`${cm.name}, content manager på LeTrend`}
          style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${palette.brown}` }}
        />
      ) : (
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            background: cm.color || palette.brown,
            color: palette.cream,
            border: `2px solid ${palette.brown}`,
            fontWeight: 900,
          }}
        >
          {initial}
        </div>
      )}
      <div style={{ fontSize: 14, color: 'rgba(31,26,20,0.82)', lineHeight: 1.45 }}>
        <strong style={{ color: palette.brown }}>{cm.name}</strong> är er content manager och
        ansvarar för att kurera feeden, justera koncepten och hålla planen levande.
        {cm.city ? <span style={{ color: palette.textMuted }}> · {cm.city}</span> : null}
      </div>
    </div>
  );
}

function GamePlanSection({ demo }: { demo: DemoPreviewPayload['demo'] }) {
  const hasGamePlan = Boolean(demo.gamePlanHtml || demo.gamePlanText);

  return (
    <section style={{ ...sectionStyle, background: palette.mint, padding: '72px 0' }}>
      <div
        style={{
          ...containerStyle(1040),
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 5fr) minmax(320px, 7fr)',
          gap: 46,
          alignItems: 'stretch',
        }}
        className="demo-preview-two-col"
      >
        <div>
          <p style={eyebrowStyle(palette.goldDeep)}>Game Plan</p>
          <h2 style={sectionHeadingStyle}>Våra första spaningar</h2>
          <div style={bodyCopyStackStyle}>
            <p>
              Game Plan är arbetsdokumentet där er content manager samlar strategi, referenser,
              möjliga format och vad vi vill testa först.
            </p>
            <p>
              Previewn visar antingen ett demoanpassat AI-utkast, manuellt inskrivet material eller
              det game-plan-dokument som redan finns på kundprofilen.
            </p>
          </div>
        </div>

        <div
          style={{
            border: `1px solid ${palette.lineStrong}`,
            background: '#FDFCF7',
            borderRadius: 18,
            overflow: 'hidden',
            boxShadow: '0 24px 50px rgba(74,47,24,0.12)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              borderBottom: `1px solid ${palette.line}`,
              padding: '12px 18px',
              color: palette.textMuted,
              fontFamily: 'var(--app-font-mono)',
              fontSize: 11,
            }}
          >
            <span>game-plan / {demo.companyName.toLowerCase().replace(/\s+/g, '-')}.md</span>
            <span>utkast</span>
          </div>
          <div style={{ padding: '24px 28px', minHeight: 300 }}>
            {hasGamePlan ? (
              demo.gamePlanHtml ? (
                <GamePlanDisplay html={demo.gamePlanHtml} />
              ) : (
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.75 }}>
                  {demo.gamePlanText}
                </div>
              )
            ) : (
              <div style={{ color: palette.textMuted, lineHeight: 1.7 }}>
                Game Plan fylls på av er content manager innan länken skickas vidare.
              </div>
            )}
            <div
              style={{
                marginTop: 22,
                borderTop: `1px dashed ${palette.lineStrong}`,
                paddingTop: 12,
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                color: palette.textMuted,
                fontFamily: 'var(--app-font-mono)',
                fontSize: 11,
              }}
            >
              <span style={{ display: 'inline-block', width: 2, height: 14, background: palette.brown }} />
              fortsätter skriva...
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricsSection({
  demo,
  conceptCount,
}: {
  demo: DemoPreviewPayload['demo'];
  conceptCount: number;
}) {
  const metrics = demo.previewMetrics ?? {};
  const avgViews = readMetric(metrics.avg_views) ?? readMetric(metrics.averageViews);
  const followers = readMetric(metrics.followers) ?? readMetric(metrics.current_followers);
  const likeRate = readMetric(metrics.like_rate) ?? readMetric(metrics.likeRate);
  const engagement = readMetric(metrics.engagement_rate) ?? readMetric(metrics.avg_engagement);

  return (
    <section style={{ ...sectionStyle, background: 'rgba(244,228,216,0.55)', padding: '72px 0' }}>
      <div
        style={{
          ...containerStyle(1040),
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 5fr)',
          gap: 46,
          alignItems: 'center',
        }}
        className="demo-preview-two-col"
      >
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }} className="demo-preview-card-grid">
            <MetricCard label="Snittvisningar" value={avgViews ?? 'Live-data'} hint="TikTok / Studio" />
            <MetricCard label="Följare" value={followers ?? 'Synkas'} hint="senaste snapshot" />
            <MetricCard label="Koncept i plan" value={String(conceptCount)} hint="från feed planner" />
            <MetricCard label="Engagemang" value={likeRate ?? engagement ?? 'Signal'} hint="kvalitet före räckvidd" />
          </div>
        </div>
        <div>
          <p style={eyebrowStyle(palette.goldDeep)}>Datadrivet</p>
          <h2 style={sectionHeadingStyle}>Vi räknar på det som betyder något</h2>
          <div style={bodyCopyStackStyle}>
            <p>
              Bra snittvisningar är trevligt, men säger inte allt. Vi tittar på återkommande
              publicering, engagemang och vilka format som går att upprepa utan att tappa kvalitet.
            </p>
            <p>
              När {demo.companyName} går från demo till kund uppdateras de här signalerna löpande
              från Studio-flödet.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function readMetric(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString('sv-SE');
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div style={{ border: `1px solid ${palette.lineStrong}`, background: palette.paper, borderRadius: 20, padding: 18, boxShadow: '0 14px 30px rgba(74,47,24,0.10)' }}>
      <p style={{ margin: 0, color: palette.textMuted, fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</p>
      <p style={{ margin: '10px 0 0', color: palette.brown, fontFamily: 'var(--app-font-serif)', fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{value}</p>
      <p style={{ margin: '8px 0 0', color: palette.textMuted, fontSize: 11 }}>{hint}</p>
    </div>
  );
}

function ProofCard({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div style={{ border: `1px solid ${palette.lineStrong}`, background: palette.paper, borderRadius: 22, padding: 24, boxShadow: '0 18px 42px rgba(74,47,24,0.08)' }}>
      <div style={{ width: 42, height: 42, borderRadius: 14, display: 'grid', placeItems: 'center', background: palette.brown, color: palette.cream }}>{icon}</div>
      <h3 style={{ margin: '18px 0 0', color: palette.brown, fontSize: 20, fontFamily: 'var(--app-font-serif)' }}>{title}</h3>
      <p style={{ margin: '8px 0 0', color: 'rgba(31,26,20,0.72)', fontSize: 14, lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}

function PhoneMock() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <img
        src="/demo-auto-clip-phone.svg"
        alt="LeTrend Auto-clip mobilflöde"
        style={{
          width: 'min(100%, 360px)',
          height: 'auto',
          display: 'block',
          filter: 'drop-shadow(0 30px 55px rgba(31,26,20,0.24))',
        }}
      />
    </div>
  );
}

function FeatureList({ items }: { items: Array<{ icon: ReactNode; text: string }> }) {
  return (
    <ul style={{ display: 'grid', gap: 12, margin: '22px 0 0', padding: 0, listStyle: 'none' }}>
      {items.map((item) => (
        <li key={item.text} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: 'rgba(31,26,20,0.78)', fontSize: 14, lineHeight: 1.5 }}>
          <span style={{ color: palette.goldDeep, marginTop: 2 }}>{item.icon}</span>
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

function AgencyCard() {
  return (
    <div style={{ border: `1px solid ${palette.lineStrong}`, background: palette.paper, borderRadius: 24, padding: 22, boxShadow: '0 22px 48px rgba(74,47,24,0.14)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pill>
          <Sparkles size={13} /> Nytt samarbete
        </Pill>
        <span style={{ borderRadius: 999, background: palette.mint, padding: '5px 8px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Förslag</span>
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', borderBottom: `1px dashed ${palette.lineStrong}`, padding: '20px 0' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', display: 'grid', placeItems: 'center', background: palette.brown, color: palette.cream, fontWeight: 900, border: `2px solid ${palette.ink}` }}>UGC</div>
        <div>
          <div style={{ fontFamily: 'var(--app-font-serif)', fontSize: 20, fontWeight: 900 }}>Matchad kreatör</div>
          <div style={{ color: palette.textMuted, fontSize: 12 }}>Mat & livsstil · budget enligt scope</div>
        </div>
      </div>
      <FeatureList
        items={[
          { icon: <CheckCircle2 size={15} />, text: 'Medverka i video' },
          { icon: <Mic size={15} />, text: 'Skriva sketch eller manus' },
          { icon: <Scissors size={15} />, text: 'Producera och regissera' },
        ]}
      />
    </div>
  );
}

function InlineCheck({ children }: { children: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <CheckCircle2 size={14} /> {children}
    </span>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid rgba(250,248,245,0.28)', background: 'rgba(250,248,245,0.09)', borderRadius: 999, padding: '9px 13px' }}>
      <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.62 }}>{label}</span>
      <span style={{ marginLeft: 8, fontSize: 14, fontWeight: 900 }}>{value}</span>
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 999, background: 'rgba(74,47,24,0.10)', color: palette.brown, padding: '7px 10px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
      {children}
    </span>
  );
}

function containerStyle(maxWidth: number): CSSProperties {
  return {
    width: 'min(calc(100% - 40px), ' + maxWidth + 'px)',
    margin: '0 auto',
    position: 'relative',
    zIndex: 1,
  };
}

function eyebrowStyle(color: string): CSSProperties {
  return {
    margin: '0 0 12px',
    color,
    fontSize: 11,
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: '0.18em',
  };
}

const sectionHeadingStyle: CSSProperties = {
  margin: 0,
  color: palette.brown,
  fontFamily: 'var(--app-font-serif)',
  fontSize: 'clamp(30px, 4.4vw, 46px)',
  lineHeight: 1.05,
  letterSpacing: '-0.035em',
};

const bodyCopyStackStyle: CSSProperties = {
  marginTop: 20,
  display: 'grid',
  gap: 13,
  color: 'rgba(31,26,20,0.76)',
  fontSize: 15,
  lineHeight: 1.72,
};
