import React, { useState } from 'react';

// ============================================
// BRAND PROFILE
// ============================================
const BRAND_PROFILE = {
  handle: '@mellowcafe',
  avatar: 'M',
  followers: '12,4K',
  avgViews: '8,2K',
  posts: 47,
  tone: ['mysig', 'deadpan', 'relaterbar'],
  energy: 'Varm men torr',
  teamSize: '2-3 personer',
  topMechanisms: ['recognition', 'contrast', 'subversion'],
  recentHits: [
    { title: '"Vi stänger om 5 min"-blicken', views: '24K' },
    { title: 'När stamkunden kommer in', views: '18K' },
  ],
};

// ============================================
// GAME PLAN - Free flowing notes with inline links
// Link types: 'tiktok', 'instagram', 'youtube', 'article', 'external'
// Image types: 'image' (single), 'images' (grid)
// ============================================
const GAME_PLAN = {
  lastUpdated: '8 jan',
  notes: [
    { type: 'text', content: 'Hej! Här är mina tankar efter att ha gått igenom ert konto. Ring gärna om något är oklart.' },
    
    { type: 'heading', content: 'Vad som funkar' },
    { type: 'text', content: 'Ni har en tydlig röst — mysig men med torr humor. Det är ovanligt och ger er en edge. Era bästa klipp bygger på kontrast: den lugna ytan vs kaoset under. Fortsätt på det spåret.' },
    { type: 'link', label: 'Ert bästa exempel', url: 'https://tiktok.com/@mellowcafe/video/123', linkType: 'tiktok' },
    
    { type: 'heading', content: 'Vad ni kan testa' },
    { type: 'text', content: 'Jag tror ni kan pusha den torra humorn lite mer. Just nu spelar ni det säkert vilket funkar, men det finns utrymme att vara lite mer "dead inside" i leveransen. Titta på hur andra gör det — de håller masken längre än vad som känns bekvämt, och det är där skrattet kommer.' },
    { type: 'links', links: [
      { label: 'Salongwoar (se 0:08)', url: 'https://tiktok.com/@salongwoar/video/456', linkType: 'tiktok' },
      { label: 'Liknande approach', url: 'https://tiktok.com/@example/video/789', linkType: 'tiktok' },
      { label: 'Varför detta funkar', url: 'https://example.com/article', linkType: 'article' },
    ]},
    { type: 'text', content: 'Testa också att låta kunderna vara mer absurda i era sketcher. Ni behöver inte alltid vara the straight man — ibland kan rollerna bytas.' },
    
    { type: 'heading', content: 'Visuell inspiration' },
    { type: 'text', content: 'Den här känslan är vad jag menar — lugnt, varmt, men med något lite "off":' },
    { type: 'images', images: [
      { url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&h=300&fit=crop', caption: 'Lugn yta' },
      { url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&h=300&fit=crop', caption: 'Kontrast i uttryck' },
      { url: 'https://images.unsplash.com/photo-1453614512568-c4024d13c247?w=400&h=300&fit=crop', caption: 'Vardaglig känsla' },
    ]},
    
    { type: 'heading', content: 'Färgpalett att tänka på' },
    { type: 'image', url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=200&fit=crop', caption: 'Warma toner, inte för mättade. Passar er befintliga estetik.' },
    
    { type: 'heading', content: 'Timing' },
    { type: 'text', content: 'Era tisdagsposter går bättre än helgen. Troligtvis för att folk scrollar på jobbet/skolan och vill ha relaterbart content. Skippa söndagar helt — det är dead time för er målgrupp.' },
    { type: 'link', label: 'Bästa tider att posta (2024)', url: 'https://example.com/timing-guide', linkType: 'article' },
    
    { type: 'heading', content: 'En sak att undvika' },
    { type: 'text', content: 'Förklara inte skämtet. Ni gjorde det i klippet med kaffemaskinen — punch linen landade men sen la ni till en reaktion som övertydliggjorde det. Trust the audience. Klipp tidigare.' },
    { type: 'link', label: 'Det klippet jag menar', url: 'https://tiktok.com/@mellowcafe/video/789', linkType: 'tiktok' },
    
    { type: 'text', content: 'Vi kan gå igenom mer på nästa samtal. Hör av er om ni kör fast med något koncept.' },
  ]
};

// ============================================
// CONCEPTS DATA
// ============================================
const CONCEPTS = [
  {
    id: 1,
    title: 'Övertidsleendet',
    subtitle: 'Överdriven positivitet under utmattande pass',
    mechanism: 'contrast',
    mechanismLabel: 'Två Världar Möts',
    market: 'SE',
    match: 94,
    difficulty: 'Lätt',
    teamSize: '1-2',
    description: 'Personal som håller ett aggressivt leende trots uppenbar utmattning.',
    whyItWorks: 'Humorn kommer från det synliga gapet mellan spelad entusiasm och uppenbar utmattning.',
    productionNotes: [
      'En tagning, inga klipp behövs',
      'Funkar bäst med genuin trötthet',
      'Överdriva leendet men håll ögonen neutrala',
      'Ingen dialog krävs',
    ],
    script: `[SCEN: Bakom disken, slutet av passet]

[Anställd ser utmattad ut, axlarna hänger]

[Kund närmar sig]

[OMEDELBAR förvandling - största leendet]

ANSTÄLLD: "Hej! Välkommen till Mellow!"

[Håll leendet. Ögonen dör sakta.]

[Text: "Timme 9 av ett 8-timmars pass"]`,
  },
  {
    id: 2,
    title: 'Stamkunden',
    subtitle: 'Förbereder beställning innan kunden ens pratar',
    mechanism: 'recognition',
    mechanismLabel: 'Smärtsamt Relaterbart',
    market: 'DE',
    match: 92,
    difficulty: 'Lätt',
    teamSize: '2',
    description: 'Personal ser stamkund närma sig och förbereder tyst deras vanliga beställning.',
    whyItWorks: 'Igenkänningshumor — både stamkunder och personal känner till denna dynamik.',
    productionNotes: [
      'Behöver fri sikt till dörren',
      'Timing är allt',
      'Kunden ska se lite förvånad men nöjd ut',
    ],
    script: `[SCEN: Disk, vy mot entrén]

[Personal märker någon, börjar göra dryck]

[Kund kommer in, öppnar munnen]

KUND: "Hej, kan jag få—"

[Personal glider över drycken]

[Text: "08:47:an"]`,
  },
];

const HUMOR_AXES = {
  contrast: { icon: '⚖️', label: 'Två Världar Möts' },
  recognition: { icon: '😮‍💨', label: 'Smärtsamt Relaterbart' },
  subversion: { icon: '↻', label: 'Twisten' },
  dark: { icon: '🔥', label: 'Mörkt Men Roligt' },
  escalation: { icon: '⚡', label: 'Spiral' },
  deadpan: { icon: '😐', label: 'Torr & Rak' },
};

const PLANS = [
  { id: 'starter', name: 'Starter', price: 249, period: 'mån', concepts: 2, features: ['2 koncept/månad', 'Fullständiga manus', 'Produktionsguider'] },
  { id: 'growth', name: 'Growth', price: 449, period: 'mån', concepts: 5, features: ['5 koncept/månad', 'Allt i Starter', 'Prioriterad matchning', 'Humor-analys'], popular: true },
  { id: 'pro', name: 'Pro', price: 749, period: 'mån', concepts: 12, features: ['12 koncept/månad', 'Allt i Growth', 'Dedikerad support', 'Anpassade koncept'] },
];

// ============================================
// MAIN APP
// ============================================
export default function LeTrendApp() {
  const [currentView, setCurrentView] = useState('home');
  const [selectedConcept, setSelectedConcept] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState('growth');
  const [profileExpanded, setProfileExpanded] = useState(false);
  const [conceptsUsed, setConceptsUsed] = useState(1);

  const plan = PLANS.find(p => p.id === selectedPlan);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#FAF8F5',
      fontFamily: "'DM Sans', -apple-system, sans-serif"
    }}>
      {currentView === 'login' && <LoginView onLogin={() => setCurrentView('payment')} />}
      {currentView === 'payment' && <PaymentView selectedPlan={selectedPlan} setSelectedPlan={setSelectedPlan} onComplete={() => setCurrentView('home')} />}
      
      {(currentView === 'home' || currentView === 'preview' || currentView === 'brief') && (
        <Header 
          currentView={currentView} 
          plan={plan} 
          conceptsUsed={conceptsUsed}
          onBack={() => {
            if (currentView === 'brief') setCurrentView('preview');
            else { setCurrentView('home'); setSelectedConcept(null); }
          }}
        />
      )}

      {currentView === 'home' && (
        <HomeView
          profileExpanded={profileExpanded}
          setProfileExpanded={setProfileExpanded}
          onSelectConcept={(c) => { setSelectedConcept(c); setCurrentView('preview'); }}
        />
      )}

      {currentView === 'preview' && selectedConcept && (
        <PreviewView concept={selectedConcept} onUnlock={() => { setConceptsUsed(conceptsUsed + 1); setCurrentView('brief'); }} plan={plan} conceptsUsed={conceptsUsed} />
      )}

      {currentView === 'brief' && selectedConcept && <BriefView concept={selectedConcept} />}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

// ============================================
// HEADER
// ============================================
function Header({ currentView, plan, conceptsUsed, onBack }) {
  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 20px',
      borderBottom: '1px solid rgba(74, 47, 24, 0.06)',
      background: '#FAF8F5',
      position: 'sticky',
      top: 0,
      zIndex: 50
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {currentView !== 'home' && (
          <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', padding: '4px 8px' }}>←</button>
        )}
        <Logo size={32} />
        <span style={{ fontSize: '16px', fontWeight: '600', color: '#1A1612' }}>LeTrend</span>
      </div>
      {currentView === 'home' && plan && (
        <div style={{ padding: '6px 12px', background: '#F0EBE4', borderRadius: '20px', fontSize: '13px', color: '#5D4D3D' }}>
          {plan.concepts - conceptsUsed} av {plan.concepts} kvar
        </div>
      )}
    </header>
  );
}

// ============================================
// LOGO
// ============================================
const LOGO_URL = '/letrend-logo.png';
function Logo({ size = 32 }) {
  return <img src={LOGO_URL} alt="LeTrend" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />;
}

// ============================================
// LINK BUTTON - With type-specific icons
// ============================================
const LINK_ICONS = {
  tiktok: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
    </svg>
  ),
  instagram: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/>
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
    </svg>
  ),
  youtube: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.5 6.19a3.02 3.02 0 00-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 00.5 6.19 31.5 31.5 0 000 12a31.5 31.5 0 00.5 5.81 3.02 3.02 0 002.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 002.12-2.14A31.5 31.5 0 0024 12a31.5 31.5 0 00-.5-5.81zM9.55 15.5V8.5l6.27 3.5-6.27 3.5z"/>
    </svg>
  ),
  article: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <line x1="10" y1="9" x2="8" y2="9"/>
    </svg>
  ),
  external: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
      <polyline points="15,3 21,3 21,9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  ),
};

function LinkButton({ link }) {
  const icon = LINK_ICONS[link.linkType] || LINK_ICONS.external;
  
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 10px',
        background: '#F5F2EE',
        borderRadius: '6px',
        textDecoration: 'none',
        fontSize: '13px',
        color: '#6B4423',
        border: '1px solid rgba(74,47,24,0.04)'
      }}
    >
      <span style={{ 
        display: 'flex', 
        alignItems: 'center',
        color: '#8B7355'
      }}>
        {icon}
      </span>
      {link.label}
    </a>
  );
}

// ============================================
// HOME VIEW
// ============================================
function HomeView({ profileExpanded, setProfileExpanded, onSelectConcept }) {
  return (
    <main style={{ paddingBottom: '40px' }}>
      {/* Brand Profile */}
      <BrandProfileBanner expanded={profileExpanded} setExpanded={setProfileExpanded} />

      {/* Concepts Section */}
      <section style={{ padding: '0 16px', marginBottom: '32px' }}>
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', color: '#9D8E7D', marginBottom: '2px' }}>BÄSTA MATCHNINGAR</div>
          <div style={{ fontSize: '15px', fontWeight: '600', color: '#1A1612' }}>För {BRAND_PROFILE.handle}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {CONCEPTS.map(concept => (
            <ConceptCard key={concept.id} concept={concept} onClick={() => onSelectConcept(concept)} />
          ))}
        </div>
      </section>

      {/* Game Plan Section */}
      <section style={{ padding: '0 16px' }}>
        <div style={{ borderTop: '1px solid rgba(74, 47, 24, 0.08)', paddingTop: '24px' }}>
          
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '14px'
          }}>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#1A1612' }}>
              Game Plan
            </div>
            <div style={{ fontSize: '12px', color: '#9D8E7D' }}>
              {GAME_PLAN.lastUpdated}
            </div>
          </div>

          {/* Notes container */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid rgba(74,47,24,0.06)',
            padding: '18px 20px'
          }}>
            {GAME_PLAN.notes.map((note, i) => {
              if (note.type === 'heading') {
                return (
                  <div key={i} style={{
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#1A1612',
                    marginTop: i === 0 ? 0 : '20px',
                    marginBottom: '6px'
                  }}>
                    {note.content}
                  </div>
                );
              }

              if (note.type === 'text') {
                return (
                  <p key={i} style={{
                    fontSize: '14px',
                    color: '#4A4239',
                    lineHeight: '1.6',
                    marginBottom: '10px'
                  }}>
                    {note.content}
                  </p>
                );
              }

              if (note.type === 'link') {
                return <LinkButton key={i} link={note} />;
              }

              if (note.type === 'links') {
                return (
                  <div key={i} style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    marginBottom: '10px'
                  }}>
                    {note.links.map((link, j) => (
                      <LinkButton key={j} link={link} />
                    ))}
                  </div>
                );
              }

              if (note.type === 'image') {
                return (
                  <div key={i} style={{ marginBottom: '12px' }}>
                    <img 
                      src={note.url} 
                      alt={note.caption || ''} 
                      style={{
                        width: '100%',
                        borderRadius: '8px',
                        display: 'block'
                      }}
                    />
                    {note.caption && (
                      <div style={{
                        fontSize: '12px',
                        color: '#7D6E5D',
                        marginTop: '6px',
                        fontStyle: 'italic'
                      }}>
                        {note.caption}
                      </div>
                    )}
                  </div>
                );
              }

              if (note.type === 'images') {
                return (
                  <div key={i} style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${Math.min(note.images.length, 3)}, 1fr)`,
                    gap: '8px',
                    marginBottom: '12px'
                  }}>
                    {note.images.map((img, j) => (
                      <div key={j}>
                        <img 
                          src={img.url} 
                          alt={img.caption || ''} 
                          style={{
                            width: '100%',
                            aspectRatio: '4/3',
                            objectFit: 'cover',
                            borderRadius: '6px',
                            display: 'block'
                          }}
                        />
                        {img.caption && (
                          <div style={{
                            fontSize: '11px',
                            color: '#9D8E7D',
                            marginTop: '4px',
                            textAlign: 'center'
                          }}>
                            {img.caption}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              }

              return null;
            })}
          </div>
        </div>
      </section>
    </main>
  );
}

// ============================================
// BRAND PROFILE BANNER
// ============================================
function BrandProfileBanner({ expanded, setExpanded }) {
  return (
    <div style={{
      margin: '16px',
      padding: '16px',
      background: 'linear-gradient(145deg, #4A2F18, #3D2510)',
      borderRadius: '16px'
    }}>
      <div onClick={() => setExpanded(!expanded)} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '50%',
          background: 'rgba(250,248,245,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#FAF8F5', fontSize: '20px', fontWeight: '600'
        }}>
          {BRAND_PROFILE.avatar}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#FAF8F5' }}>{BRAND_PROFILE.handle}</div>
          <div style={{ fontSize: '12px', color: 'rgba(250,248,245,0.6)' }}>{BRAND_PROFILE.followers} följare</div>
        </div>
        <span style={{ color: 'rgba(250,248,245,0.5)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
      </div>

      {expanded && (
        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(250,248,245,0.1)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '10px', color: 'rgba(250,248,245,0.5)', marginBottom: '4px' }}>ENERGI</div>
              <div style={{ fontSize: '14px', color: '#FAF8F5' }}>{BRAND_PROFILE.energy}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: 'rgba(250,248,245,0.5)', marginBottom: '4px' }}>TEAM</div>
              <div style={{ fontSize: '14px', color: '#FAF8F5' }}>{BRAND_PROFILE.teamSize}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {BRAND_PROFILE.tone.map(t => (
              <span key={t} style={{ fontSize: '11px', padding: '4px 10px', background: 'rgba(250,248,245,0.12)', borderRadius: '10px', color: '#FAF8F5' }}>{t}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// CONCEPT CARD
// ============================================
function ConceptCard({ concept, onClick }) {
  const axis = HUMOR_AXES[concept.mechanism];
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '14px', padding: '14px',
      background: '#FFFFFF', borderRadius: '14px', border: '1px solid rgba(74,47,24,0.08)', cursor: 'pointer'
    }}>
      <div style={{
        width: '48px', height: '48px', borderRadius: '12px',
        background: concept.match > 85 ? '#5A8F5A' : '#F0EBE4',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: concept.match > 85 ? '#FFF' : '#7D6E5D',
        fontSize: '15px', fontWeight: '700'
      }}>
        {concept.match}%
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '15px', fontWeight: '600', color: '#1A1612', marginBottom: '4px' }}>{concept.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', padding: '2px 8px', background: '#F0EBE4', borderRadius: '8px', color: '#6B5D4D' }}>
            {axis?.icon} {axis?.label}
          </span>
          <span style={{ fontSize: '11px', color: '#9D8E7D' }}>{concept.market}</span>
        </div>
      </div>
      <span style={{ color: '#9D8E7D', fontSize: '18px' }}>→</span>
    </div>
  );
}

// ============================================
// LOGIN VIEW
// ============================================
function LoginView({ onLogin }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px 24px', background: 'linear-gradient(180deg, #FAF8F5 0%, #F0EBE4 100%)' }}>
      <div style={{ maxWidth: '360px', margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <img src={LOGO_URL} alt="LeTrend" style={{ width: '80px', height: '80px', borderRadius: '50%', margin: '0 auto 20px', boxShadow: '0 8px 32px rgba(107, 68, 35, 0.25)' }} />
          <h1 style={{ fontSize: '28px', fontWeight: '600', color: '#1A1612', marginBottom: '8px' }}>Välkommen till LeTrend</h1>
          <p style={{ fontSize: '15px', color: '#7D6E5D' }}>Virala sketchkoncept för ditt varumärke</p>
        </div>
        <div style={{ background: '#FFFFFF', borderRadius: '20px', padding: '28px', boxShadow: '0 4px 24px rgba(44, 36, 22, 0.08)' }}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#5D4D3D', marginBottom: '8px' }}>E-post</label>
            <input type="email" placeholder="din@email.se" style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(74, 47, 24, 0.15)', fontSize: '15px', outline: 'none' }} />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#5D4D3D', marginBottom: '8px' }}>Lösenord</label>
            <input type="password" placeholder="••••••••" style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(74, 47, 24, 0.15)', fontSize: '15px', outline: 'none' }} />
          </div>
          <button onClick={onLogin} style={{ width: '100%', padding: '16px', background: 'linear-gradient(145deg, #6B4423, #4A2F18)', border: 'none', borderRadius: '14px', color: '#FAF8F5', fontSize: '16px', fontWeight: '600', cursor: 'pointer' }}>Logga in</button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// PAYMENT VIEW
// ============================================
function PaymentView({ selectedPlan, setSelectedPlan, onComplete }) {
  const [step, setStep] = useState('plan');
  return (
    <div style={{ minHeight: '100vh', background: '#FAF8F5', paddingBottom: '40px' }}>
      <div style={{ padding: '24px 20px', textAlign: 'center', borderBottom: '1px solid rgba(74, 47, 24, 0.06)' }}>
        <Logo size={48} />
        <div style={{ marginTop: '16px', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9D8E7D' }}>
          {step === 'plan' ? 'Steg 1 av 2' : 'Steg 2 av 2'}
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#1A1612', marginTop: '8px' }}>
          {step === 'plan' ? 'Välj din plan' : 'Betalning'}
        </h1>
      </div>

      {step === 'plan' && (
        <div style={{ padding: '24px 16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
            {PLANS.map(plan => (
              <div key={plan.id} onClick={() => setSelectedPlan(plan.id)} style={{
                padding: '20px', background: selectedPlan === plan.id ? '#4A2F18' : '#FFFFFF',
                borderRadius: '16px', border: selectedPlan === plan.id ? '2px solid #4A2F18' : '1px solid rgba(74, 47, 24, 0.1)',
                cursor: 'pointer', position: 'relative'
              }}>
                {plan.popular && <div style={{ position: 'absolute', top: '-10px', right: '16px', background: '#8B6914', color: '#FFF', padding: '4px 12px', borderRadius: '10px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase' }}>Populärast</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: '600', color: selectedPlan === plan.id ? '#FAF8F5' : '#1A1612' }}>{plan.name}</div>
                    <div style={{ fontSize: '13px', color: selectedPlan === plan.id ? 'rgba(250,248,245,0.7)' : '#9D8E7D' }}>{plan.concepts} koncept/månad</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: selectedPlan === plan.id ? '#FAF8F5' : '#1A1612' }}>{plan.price} kr</div>
                    <div style={{ fontSize: '12px', color: selectedPlan === plan.id ? 'rgba(250,248,245,0.6)' : '#9D8E7D' }}>/{plan.period}</div>
                  </div>
                </div>
                {plan.features.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: selectedPlan === plan.id ? 'rgba(250,248,245,0.9)' : '#5D4D3D', marginBottom: '4px' }}>
                    <span style={{ color: selectedPlan === plan.id ? '#8B6914' : '#5A8F5A' }}>✓</span>{f}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <button onClick={() => setStep('payment')} style={{ width: '100%', padding: '16px', background: 'linear-gradient(145deg, #6B4423, #4A2F18)', border: 'none', borderRadius: '14px', color: '#FAF8F5', fontSize: '16px', fontWeight: '600', cursor: 'pointer' }}>Fortsätt</button>
        </div>
      )}

      {step === 'payment' && (
        <div style={{ padding: '24px 16px' }}>
          <div style={{ padding: '16px', background: '#F5F2EE', borderRadius: '14px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '600', color: '#1A1612' }}>{PLANS.find(p => p.id === selectedPlan)?.name}</div>
              <div style={{ fontSize: '13px', color: '#7D6E5D' }}>{PLANS.find(p => p.id === selectedPlan)?.concepts} koncept/månad</div>
            </div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#1A1612' }}>{PLANS.find(p => p.id === selectedPlan)?.price} kr/mån</div>
          </div>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#5D4D3D', marginBottom: '8px' }}>Kortnummer</label>
              <input placeholder="1234 5678 9012 3456" style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(74, 47, 24, 0.15)', fontSize: '15px', outline: 'none' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#5D4D3D', marginBottom: '8px' }}>Utgång</label>
                <input placeholder="MM/ÅÅ" style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(74, 47, 24, 0.15)', fontSize: '15px', outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#5D4D3D', marginBottom: '8px' }}>CVC</label>
                <input placeholder="123" style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(74, 47, 24, 0.15)', fontSize: '15px', outline: 'none' }} />
              </div>
            </div>
          </div>
          <button onClick={onComplete} style={{ width: '100%', padding: '16px', background: 'linear-gradient(145deg, #6B4423, #4A2F18)', border: 'none', borderRadius: '14px', color: '#FAF8F5', fontSize: '16px', fontWeight: '600', cursor: 'pointer', marginBottom: '12px' }}>Starta prenumeration</button>
          <button onClick={() => setStep('plan')} style={{ width: '100%', padding: '12px', background: 'transparent', border: 'none', color: '#7D6E5D', fontSize: '14px', cursor: 'pointer' }}>← Tillbaka</button>
        </div>
      )}
    </div>
  );
}

// ============================================
// PREVIEW VIEW
// ============================================
function PreviewView({ concept, onUnlock, plan, conceptsUsed }) {
  const axis = HUMOR_AXES[concept.mechanism];
  return (
    <main style={{ paddingBottom: '100px' }}>
      <div style={{ width: '100%', paddingBottom: '56%', background: 'linear-gradient(145deg, #5D4D3D, #4A3F33)', position: 'relative' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(250,248,245,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FAF8F5', fontSize: '24px' }}>▶</div>
        <div style={{ position: 'absolute', top: '16px', left: '16px', background: concept.match > 85 ? '#5A8F5A' : '#4A2F18', color: '#FFF', padding: '6px 12px', borderRadius: '12px', fontSize: '13px', fontWeight: '700' }}>{concept.match}% match</div>
      </div>
      <div style={{ padding: '20px' }}>
        <div style={{ fontSize: '22px', fontWeight: '600', color: '#1A1612', marginBottom: '8px' }}>{concept.title}</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <span style={{ fontSize: '12px', padding: '4px 10px', background: '#F0EBE4', borderRadius: '10px', color: '#5D4D3D' }}>{axis?.icon} {axis?.label}</span>
          <span style={{ fontSize: '12px', padding: '4px 10px', background: '#F0EBE4', borderRadius: '10px', color: '#5D4D3D' }}>{concept.difficulty}</span>
        </div>
        <p style={{ fontSize: '15px', color: '#5D4D3D', lineHeight: '1.6', marginBottom: '20px' }}>{concept.description}</p>
        <div style={{ padding: '16px', background: '#F5F2EE', borderRadius: '14px', marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#9D8E7D', marginBottom: '8px' }}>VARFÖR DET FUNKAR</div>
          <div style={{ fontSize: '14px', color: '#5D4D3D', lineHeight: '1.5' }}>{concept.whyItWorks}</div>
        </div>
      </div>
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '16px 20px', background: '#FFFFFF', borderTop: '1px solid rgba(74,47,24,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '12px', color: '#9D8E7D' }}>Inkluderat i din plan</div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#1A1612' }}>{plan.concepts - conceptsUsed} kvar</div>
        </div>
        <button onClick={onUnlock} style={{ padding: '16px 28px', background: 'linear-gradient(145deg, #5D3A1A, #3D2510)', border: 'none', borderRadius: '14px', color: '#FAF8F5', fontSize: '16px', fontWeight: '600', cursor: 'pointer' }}>Lås upp</button>
      </div>
    </main>
  );
}

// ============================================
// BRIEF VIEW
// ============================================
function BriefView({ concept }) {
  const [activeTab, setActiveTab] = useState('script');
  const axis = HUMOR_AXES[concept.mechanism];

  return (
    <main style={{ paddingBottom: '40px' }}>
      <div style={{ padding: '24px 20px', background: 'linear-gradient(145deg, #5A8F5A, #4A7A4A)', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>✓</div>
        <div style={{ fontSize: '18px', fontWeight: '600', color: '#FFF' }}>Allt klart</div>
        <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>{concept.title} är redo</div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid rgba(74,47,24,0.1)', background: '#FFF' }}>
        {['script', 'checklist', 'breakdown'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            flex: 1, padding: '14px', background: 'none', border: 'none',
            borderBottom: activeTab === tab ? '2px solid #4A2F18' : '2px solid transparent',
            color: activeTab === tab ? '#1A1612' : '#9D8E7D', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
          }}>
            {tab === 'script' ? 'Manus' : tab === 'checklist' ? 'Checklista' : 'Analys'}
          </button>
        ))}
      </div>

      <div style={{ padding: '20px' }}>
        {activeTab === 'script' && (
          <>
            <div style={{ width: '100%', paddingBottom: '56%', background: 'linear-gradient(145deg, #5D4D3D, #4A3F33)', borderRadius: '14px', position: 'relative', marginBottom: '20px' }}>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(250,248,245,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FAF8F5', fontSize: '20px' }}>▶</div>
            </div>
            <div style={{ padding: '20px', background: '#2C2416', borderRadius: '14px' }}>
              <div style={{ fontSize: '11px', color: 'rgba(250,248,245,0.5)', marginBottom: '16px' }}>MANUS</div>
              <pre style={{ fontSize: '13px', color: '#FAF8F5', lineHeight: '1.7', whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'monospace' }}>{concept.script}</pre>
            </div>
          </>
        )}

        {activeTab === 'checklist' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {concept.productionNotes?.map((note, i) => (
              <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px 16px', background: '#FFFFFF', borderRadius: '12px', border: '1px solid rgba(74,47,24,0.08)', cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: '20px', height: '20px', accentColor: '#4A2F18' }} />
                <span style={{ fontSize: '14px', color: '#3D3229', lineHeight: '1.5' }}>{note}</span>
              </label>
            ))}
          </div>
        )}

        {activeTab === 'breakdown' && (
          <>
            <div style={{ padding: '16px', background: '#FFFFFF', borderRadius: '14px', border: '1px solid rgba(74,47,24,0.08)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px' }}>{axis?.icon}</span>
              <div>
                <div style={{ fontSize: '11px', color: '#9D8E7D' }}>MEKANISM</div>
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#1A1612' }}>{axis?.label}</div>
              </div>
            </div>
            <div style={{ padding: '16px', background: '#F5F2EE', borderRadius: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#9D8E7D', marginBottom: '10px' }}>VARFÖR DET FUNKAR</div>
              <div style={{ fontSize: '14px', color: '#3D3229', lineHeight: '1.6' }}>{concept.whyItWorks}</div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
