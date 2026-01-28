import React, { useState } from 'react';

// LeTrend Design System
const colors = {
  primary: '#4A2F18',
  secondary: '#6B4423',
  accent: '#8B6914',
  bg: '#FAF8F5',
  card: '#FFFFFF',
  muted: '#F0EBE4',
  text: '#1A1612',
  textMuted: '#7D6E5D',
  textSubtle: '#9D8E7D',
  success: '#5A8F5A',
  dark: '#3D3530',
  scriptBg: '#2F2A27',
};

const fontFamily = '"DM Sans", system-ui, -apple-system, sans-serif';

export default function LeTrendMobile() {
  const [view, setView] = useState('login');
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [selected, setSelected] = useState(null);
  const [unlocked, setUnlocked] = useState(false);
  const [tab, setTab] = useState('manus');
  const [checks, setChecks] = useState({});

  const categories = [
    { name: 'Restaurang', handle: '@bistro.karelia' },
    { name: 'Café', handle: '@mellowroast.gbg' },
    { name: 'Bar', handle: '@tavernan.sthlm' },
    { name: 'Café (gen z)', handle: '@coffeelab.gbg' },
    { name: 'Restaurang (upscale)', handle: '@finedine.sthlm' },
  ];

  const cat = categories[categoryIndex];

  const concepts = [
    {
      id: 1,
      origin: 'SE',
      matchPercent: 80,
      title: 'När chefen tittar — plötsligt glömmer man hur man jobbar',
      tags: ['Smärtsamt Relaterbart', 'Medel', 'Bara du'],
      description: 'En anställd gör plötsligt klumpiga misstag i köket och vid kassan så fort chefen börjar observera. Nervositeten tar över helt.',
      whyItWorks: 'Visar på den universella nervositeten och prestationsångesten när man är under chefens granskning. Alla känner igen känslan av att plötsligt bli fumlig under observation.',
      script: `[SCEN: Kök och kassa]

[Text overlay: "När chefen tittar på"]

[Normal arbetsuppgift — plötsligt fumlig]

[Tappar saker, trycker fel knappar]

[Chef i bakgrunden, observerar]

[Anställd svettas, gör fler misstag]

[Text overlay: "Varje. Gång."]`,
      checklist: [
        'Enkel produktion - smartphone räcker',
        'Kräver två personer',
        'Överdrivna reaktioner',
      ],
      quickInfo: {
        people: 'Bara du',
        difficulty: 'Medel',
      },
      isNew: true,
    },
    {
      id: 2,
      origin: 'US',
      matchPercent: 85,
      title: 'Vi stänger om 5 minuter (ingen rör sig)',
      tags: ['Awkward Humor', 'Lätt', '2-3 pers'],
      description: 'Personalen annonserar stängning men gästen ignorerar det fullständigt. Obekväm tystnad följer.',
      whyItWorks: 'Den obekväma tystnaden och det sociala spelet mellan personal och gäst är universellt relaterbart för alla i servicebranschen.',
      script: `[SCEN: Bar/restaurang, sen kväll]

[Gäst sitter ensam vid bardisken]

Personal: "Vi stänger om fem minuter."

[Gästen rör sig inte]

[Personal tittar på varandra]

[10 sekunder obekväm tystnad]

[Text overlay: "Varje fredag"]`,
      checklist: [
        'Smartphone räcker',
        'Kräver en gäst (kan vara vän)',
        'Timingen på tystnaden är allt',
      ],
      quickInfo: {
        people: '2-3 pers',
        difficulty: 'Lätt',
      },
      isNew: true,
    },
    {
      id: 3,
      origin: 'UK',
      matchPercent: 78,
      title: 'Beställde UTAN lök (dramatisk zoom)',
      tags: ['Dramatisk Ironi', 'Lätt', 'Bara du'],
      description: 'Thriller-estetik möter vardagligt köksproblem. Dramatisk musik och zoom på den förbjudna ingrediensen.',
      whyItWorks: 'Kontrasten mellan den överdrivna dramatiken och det triviala problemet skapar omedelbar komik.',
      script: `[SCEN: Kök]

Gäst (off-screen): "Ursäkta, jag beställde UTAN lök."

[Dramatisk zoom på löken]

[Mörk, hotfull musik]

[Kocken i bakgrunden, stirrar]

[Freeze frame]`,
      checklist: [
        'Hitta dramatisk musik (royalty-free)',
        'Öva zoom-timingen',
        'Deadpan-uttryck från kocken',
      ],
      quickInfo: {
        people: 'Bara du',
        difficulty: 'Lätt',
      },
      isNew: false,
    },
  ];

  const resetAndSelect = (concept) => {
    setSelected(concept);
    setUnlocked(false);
    setTab('manus');
    setChecks({});
    setView('detail');
  };

  // Shared styles
  const pageContainer = {
    position: 'fixed',
    inset: 0,
    overflow: 'hidden',
    fontFamily,
  };

  const scrollContainer = {
    width: '100%',
    height: '100%',
    overflowY: 'auto',
    overflowX: 'hidden',
    WebkitOverflowScrolling: 'touch',
    overscrollBehavior: 'contain',
  };

  const buttonBase = {
    border: 'none',
    cursor: 'pointer',
    fontFamily,
    WebkitTapHighlightColor: 'transparent',
  };

  // === LOGIN ===
  if (view === 'login') {
    return (
      <div style={{ ...pageContainer, background: colors.bg }}>
        <div style={{ ...scrollContainer, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: '100%', boxSizing: 'border-box' }}>
          
          {/* Logo */}
          <div style={{
            width: 72,
            height: 72,
            background: `linear-gradient(135deg, ${colors.secondary} 0%, ${colors.primary} 100%)`,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 28,
            boxShadow: '0 4px 20px rgba(74, 47, 24, 0.25)',
          }}>
            <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 26, color: '#fff' }}>Le</span>
          </div>

          <h1 style={{ fontSize: 28, fontWeight: 600, color: colors.text, marginBottom: 8 }}>Välkommen tillbaka</h1>
          <p style={{ fontSize: 16, color: colors.textMuted, marginBottom: 36 }}>Logga in för att se dina koncept</p>

          <div style={{ width: '100%', maxWidth: 380, background: colors.card, borderRadius: 20, padding: 28, boxShadow: '0 2px 16px rgba(74, 47, 24, 0.08)' }}>
            <label style={{ display: 'block', marginBottom: 20 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: colors.text, display: 'block', marginBottom: 8 }}>E-post</span>
              <input
                type="email"
                placeholder="din@email.se"
                style={{ width: '100%', padding: '14px 16px', fontSize: 16, fontFamily, border: `1px solid ${colors.muted}`, borderRadius: 12, boxSizing: 'border-box', outline: 'none' }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: 28 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: colors.text, display: 'block', marginBottom: 8 }}>Lösenord</span>
              <input
                type="password"
                placeholder="••••••••"
                style={{ width: '100%', padding: '14px 16px', fontSize: 16, fontFamily, border: `1px solid ${colors.muted}`, borderRadius: 12, boxSizing: 'border-box', outline: 'none' }}
              />
            </label>

            <button
              onClick={() => setView('list')}
              style={{
                ...buttonBase,
                width: '100%',
                padding: 16,
                fontSize: 16,
                fontWeight: 600,
                background: `linear-gradient(135deg, ${colors.secondary} 0%, ${colors.primary} 100%)`,
                color: '#fff',
                borderRadius: 14,
                boxShadow: '0 4px 12px rgba(74, 47, 24, 0.2)',
              }}
            >
              Logga in
            </button>

            <p style={{ textAlign: 'center', marginTop: 20 }}>
              <button style={{ ...buttonBase, background: 'none', color: colors.textMuted, fontSize: 14 }}>Glömt lösenordet?</button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // === CATEGORY PICKER ===
  const CategoryPicker = () => (
    <div
      onClick={() => setShowPicker(false)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(26, 22, 18, 0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', background: colors.card, borderRadius: '24px 24px 0 0', padding: '20px 24px 36px' }}
      >
        <div style={{ width: 40, height: 4, background: colors.muted, borderRadius: 2, margin: '0 auto 20px' }} />
        <h3 style={{ fontSize: 18, fontWeight: 600, color: colors.text, marginBottom: 16 }}>Välj kategori</h3>
        {categories.map((c, i) => (
          <button
            key={i}
            onClick={() => { setCategoryIndex(i); setShowPicker(false); }}
            style={{
              ...buttonBase,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: 16,
              background: i === categoryIndex ? colors.muted : 'transparent',
              borderRadius: 14,
              textAlign: 'left',
              marginBottom: 4,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: colors.text }}>{c.name}</div>
              <div style={{ fontSize: 14, color: colors.textMuted }}>{c.handle}</div>
            </div>
            {i === categoryIndex && <span style={{ color: colors.success, fontSize: 18 }}>✓</span>}
          </button>
        ))}
      </div>
    </div>
  );

  // === LIST ===
  if (view === 'list') {
    const newOnes = concepts.filter((c) => c.isNew);
    const older = concepts.filter((c) => !c.isNew);

    return (
      <div style={{ ...pageContainer, background: colors.bg }}>
        {showPicker && <CategoryPicker />}
        
        <div style={scrollContainer}>
          {/* Header */}
          <div style={{
            padding: '20px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: colors.card,
            borderBottom: `1px solid ${colors.muted}`,
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36,
                height: 36,
                background: `linear-gradient(135deg, ${colors.secondary} 0%, ${colors.primary} 100%)`,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 14, color: '#fff' }}>Le</span>
              </div>
              <span style={{ fontSize: 18, fontWeight: 600, color: colors.text }}>LeTrend</span>
            </div>

            <button
              onClick={() => setShowPicker(true)}
              style={{
                ...buttonBase,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: colors.muted,
                padding: '8px 14px',
                borderRadius: 20,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 500, color: colors.text }}>{cat.name}</span>
              <span style={{ color: colors.textSubtle, fontSize: 10 }}>▼</span>
            </button>
          </div>

          <div style={{ padding: 24 }}>
            {newOnes.length > 0 && (
              <>
                <p style={{ fontSize: 12, fontWeight: 600, color: colors.textSubtle, marginBottom: 14, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  Nytt denna vecka
                </p>
                {newOnes.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => resetAndSelect(c)}
                    style={{
                      ...buttonBase,
                      width: '100%',
                      background: colors.card,
                      borderRadius: 20,
                      padding: 20,
                      marginBottom: 14,
                      textAlign: 'left',
                      boxShadow: '0 2px 12px rgba(74, 47, 24, 0.06)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{
                        width: 60,
                        height: 80,
                        background: `linear-gradient(135deg, ${colors.secondary} 0%, ${colors.primary} 100%)`,
                        borderRadius: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                      }}>
                        <span style={{ fontSize: 22, color: '#fff' }}>▶</span>
                        <span style={{ position: 'absolute', top: 6, right: 6, fontSize: 10, background: 'rgba(0,0,0,0.4)', color: '#fff', padding: '2px 5px', borderRadius: 4 }}>{c.origin}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 600, color: colors.text, marginBottom: 6, lineHeight: 1.3 }}>{c.title}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {c.tags.slice(0, 2).map((tag, i) => (
                            <span key={i} style={{ fontSize: 12, color: colors.textMuted, background: colors.muted, padding: '4px 10px', borderRadius: 12 }}>{tag}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </>
            )}

            {older.length > 0 && (
              <>
                <p style={{ fontSize: 12, fontWeight: 600, color: colors.textSubtle, marginBottom: 14, marginTop: 28, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  Tidigare
                </p>
                {older.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => resetAndSelect(c)}
                    style={{
                      ...buttonBase,
                      width: '100%',
                      background: colors.card,
                      borderRadius: 20,
                      padding: 20,
                      marginBottom: 14,
                      textAlign: 'left',
                      boxShadow: '0 2px 12px rgba(74, 47, 24, 0.06)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{
                        width: 60,
                        height: 80,
                        background: colors.muted,
                        borderRadius: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                      }}>
                        <span style={{ fontSize: 22, color: colors.textMuted }}>▶</span>
                        <span style={{ position: 'absolute', top: 6, right: 6, fontSize: 10, background: 'rgba(0,0,0,0.2)', color: colors.textMuted, padding: '2px 5px', borderRadius: 4 }}>{c.origin}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 600, color: colors.text, marginBottom: 6, lineHeight: 1.3 }}>{c.title}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {c.tags.slice(0, 2).map((tag, i) => (
                            <span key={i} style={{ fontSize: 12, color: colors.textMuted, background: colors.muted, padding: '4px 10px', borderRadius: 12 }}>{tag}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // === DETAIL ===
  if (view === 'detail' && selected) {
    const c = selected;
    const allChecked = c.checklist.every((_, i) => checks[i]);

    return (
      <div style={{ ...pageContainer, background: colors.bg }}>
        <div style={scrollContainer}>
          
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: colors.card,
            borderBottom: `1px solid ${colors.muted}`,
          }}>
            <button
              onClick={() => setView('list')}
              style={{ ...buttonBase, display: 'flex', alignItems: 'center', gap: 8, background: 'none', color: colors.text, fontSize: 15, fontWeight: 500 }}
            >
              <span>←</span>
              <span>LeTrend</span>
            </button>
            <span style={{ fontSize: 14, color: colors.textMuted }}>{cat.name}</span>
          </div>

          {!unlocked ? (
            // === PRE-UNLOCK VIEW ===
            <div style={{ padding: 24 }}>
              {/* Video thumbnail */}
              <div style={{
                width: '100%',
                aspectRatio: '9/12',
                background: colors.dark,
                borderRadius: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                marginBottom: 24,
              }}>
                <div style={{ width: 72, height: 72, background: 'rgba(255,255,255,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 32, color: '#fff', marginLeft: 4 }}>▶</span>
                </div>
                <span style={{
                  position: 'absolute',
                  top: 16,
                  left: 16,
                  background: colors.success,
                  color: '#fff',
                  padding: '6px 12px',
                  borderRadius: 20,
                  fontSize: 14,
                  fontWeight: 600,
                }}>{c.matchPercent}% match</span>
                <span style={{
                  position: 'absolute',
                  top: 16,
                  right: 16,
                  background: 'rgba(0,0,0,0.5)',
                  color: '#fff',
                  padding: '4px 8px',
                  borderRadius: 6,
                  fontSize: 12,
                }}>{c.origin}</span>
              </div>

              {/* Title & tags */}
              <h1 style={{ fontSize: 22, fontWeight: 600, color: colors.text, marginBottom: 12, lineHeight: 1.3 }}>{c.title}</h1>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {c.tags.map((tag, i) => (
                  <span key={i} style={{ fontSize: 13, color: colors.textMuted, background: colors.muted, padding: '6px 14px', borderRadius: 20 }}>{tag}</span>
                ))}
              </div>
              <p style={{ fontSize: 15, color: colors.textMuted, lineHeight: 1.6, marginBottom: 28 }}>{c.description}</p>

              {/* VAD DU FÅR */}
              <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: colors.textSubtle, marginBottom: 14, letterSpacing: 0.5 }}>VAD DU FÅR</p>
                {[
                  { icon: '🎬', text: 'Original videoreferens' },
                  { icon: '📝', text: 'Fullständigt översatt manus' },
                  { icon: '✓', text: 'Produktionschecklista' },
                  { icon: '💡', text: 'Humor-analys & tips' },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: i < 3 ? `1px solid ${colors.muted}` : 'none' }}>
                    <span style={{ fontSize: 18 }}>{item.icon}</span>
                    <span style={{ fontSize: 15, color: colors.text }}>{item.text}</span>
                  </div>
                ))}
              </div>

              {/* VARFÖR DET FUNKAR */}
              <div style={{ background: colors.muted, borderRadius: 16, padding: 20, marginBottom: 28 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: colors.textSubtle, marginBottom: 10, letterSpacing: 0.5 }}>VARFÖR DET FUNKAR</p>
                <p style={{ fontSize: 15, color: colors.text, lineHeight: 1.6, margin: 0 }}>{c.whyItWorks}</p>
              </div>

              {/* Unlock CTA */}
              <div style={{ background: colors.muted, borderRadius: 20, padding: 24 }}>
                <p style={{ fontSize: 13, color: colors.textMuted, marginBottom: 6 }}>Inkluderat i din plan</p>
                <p style={{ fontSize: 16, fontWeight: 600, color: colors.text, marginBottom: 16 }}>4 koncept kvar denna månad</p>
                <button
                  onClick={() => setUnlocked(true)}
                  style={{
                    ...buttonBase,
                    width: '100%',
                    padding: 18,
                    fontSize: 16,
                    fontWeight: 600,
                    background: `linear-gradient(135deg, ${colors.secondary} 0%, ${colors.primary} 100%)`,
                    color: '#fff',
                    borderRadius: 14,
                  }}
                >
                  Lås upp koncept
                </button>
              </div>
            </div>
          ) : (
            // === POST-UNLOCK VIEW ===
            <>
              {/* Success banner */}
              <div style={{ background: colors.success, padding: '32px 24px', textAlign: 'center' }}>
                <span style={{ fontSize: 32 }}>✓</span>
                <h2 style={{ fontSize: 22, fontWeight: 600, color: '#fff', marginTop: 12 }}>Allt klart</h2>
                <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)', marginTop: 8 }}>{c.title} är redo att filmas</p>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', background: colors.card, borderBottom: `1px solid ${colors.muted}` }}>
                {['Manus', 'Checklista', 'Analys'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t.toLowerCase())}
                    style={{
                      ...buttonBase,
                      flex: 1,
                      padding: '16px 12px',
                      fontSize: 15,
                      fontWeight: 500,
                      background: 'none',
                      color: tab === t.toLowerCase() ? colors.text : colors.textMuted,
                      borderBottom: tab === t.toLowerCase() ? `2px solid ${colors.primary}` : '2px solid transparent',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div style={{ padding: 24 }}>
                {/* MANUS TAB */}
                {tab === 'manus' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Video reference */}
                    <div style={{
                      width: '100%',
                      aspectRatio: '9/14',
                      background: colors.dark,
                      borderRadius: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <div style={{ width: 64, height: 64, background: 'rgba(255,255,255,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 28, color: '#fff', marginLeft: 4 }}>▶</span>
                      </div>
                    </div>

                    {/* Script */}
                    <div style={{ background: colors.scriptBg, borderRadius: 16, padding: 24 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: colors.textSubtle, marginBottom: 16, letterSpacing: 1, textTransform: 'uppercase' }}>Manus — översatt & anpassat</p>
                      <pre style={{
                        fontFamily: '"Courier New", Courier, monospace',
                        fontSize: 14,
                        lineHeight: 1.9,
                        color: '#E8DFD4',
                        whiteSpace: 'pre-wrap',
                        margin: 0,
                      }}>
                        {c.script}
                      </pre>
                    </div>
                  </div>
                )}

                {/* CHECKLISTA TAB */}
                {tab === 'checklista' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 600, color: colors.textSubtle, marginBottom: 14, letterSpacing: 0.5, textTransform: 'uppercase' }}>Produktionschecklista</p>
                      {c.checklist.map((item, i) => (
                        <button
                          key={i}
                          onClick={() => setChecks({ ...checks, [i]: !checks[i] })}
                          style={{
                            ...buttonBase,
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 16,
                            padding: 18,
                            background: colors.muted,
                            borderRadius: 14,
                            marginBottom: 10,
                            textAlign: 'left',
                            opacity: checks[i] ? 0.6 : 1,
                          }}
                        >
                          <div style={{
                            width: 24,
                            height: 24,
                            border: checks[i] ? 'none' : `2px solid ${colors.textSubtle}`,
                            borderRadius: 6,
                            background: checks[i] ? colors.success : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            {checks[i] && <span style={{ color: '#fff', fontSize: 14 }}>✓</span>}
                          </div>
                          <span style={{ fontSize: 15, color: colors.text, textDecoration: checks[i] ? 'line-through' : 'none' }}>{item}</span>
                        </button>
                      ))}
                    </div>

                    <div>
                      <p style={{ fontSize: 12, fontWeight: 600, color: colors.textSubtle, marginBottom: 14, letterSpacing: 0.5, textTransform: 'uppercase' }}>Snabbinfo</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div style={{ background: colors.muted, borderRadius: 16, padding: 20, textAlign: 'center' }}>
                          <p style={{ fontSize: 20, fontWeight: 600, color: colors.text, marginBottom: 4 }}>{c.quickInfo.people}</p>
                          <p style={{ fontSize: 13, color: colors.textMuted }}>Personer behövs</p>
                        </div>
                        <div style={{ background: colors.muted, borderRadius: 16, padding: 20, textAlign: 'center' }}>
                          <p style={{ fontSize: 20, fontWeight: 600, color: colors.text, marginBottom: 4 }}>{c.quickInfo.difficulty}</p>
                          <p style={{ fontSize: 13, color: colors.textMuted }}>Svårighetsgrad</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ANALYS TAB */}
                {tab === 'analys' && (
                  <div style={{ background: colors.muted, borderRadius: 16, padding: 24 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: colors.textSubtle, marginBottom: 14, letterSpacing: 0.5, textTransform: 'uppercase' }}>Varför det funkar</p>
                    <p style={{ fontSize: 15, color: colors.text, lineHeight: 1.7, margin: 0 }}>{c.whyItWorks}</p>
                  </div>
                )}

                {/* Link TikTok CTA */}
                <div style={{ background: colors.muted, borderRadius: 20, padding: 24, marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <div>
                    <p style={{ fontSize: 16, fontWeight: 600, color: colors.text, marginBottom: 4 }}>Filmat klart?</p>
                    <p style={{ fontSize: 14, color: colors.textMuted }}>Länka din video för att spåra resultat</p>
                  </div>
                  <button style={{
                    ...buttonBase,
                    padding: '14px 20px',
                    fontSize: 14,
                    fontWeight: 600,
                    background: colors.primary,
                    color: '#fff',
                    borderRadius: 12,
                    whiteSpace: 'nowrap',
                  }}>
                    Länka TikTok
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return null;
}
