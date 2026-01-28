import React from 'react';

const colors = {
  primary: '#4A2F18',
  secondary: '#6B4423',
  bg: '#FAF8F5',
  card: '#FFFFFF',
  muted: '#F0EBE4',
  text: '#1A1612',
  textMuted: '#7D6E5D',
  border: '#E5DED4',
};

export default function LeTrendFaktura() {
  const invoice = {
    number: '3KNWLZKK-0001',
    issued: '19 januari 2026',
    due: '19 januari 2026',
    from: {
      name: 'LeTrend',
      org: '559XXX-XXXX',
      address: 'Hågavägen 246',
      postal: '752 63 Uppsala',
      phone: '+46 73 822 22 77',
      email: 'faktura@letrend.se',
    },
    to: {
      name: 'Mahmoud',
      address: 'Hågavägen 246',
      postal: '752 63 Uppsala',
      email: 'modikhw@gmail.com',
    },
    items: [
      {
        description: 'LeTrend, skräddarsydd lösning',
        period: '19 jan. 2026 – 19 feb. 2026',
        qty: 1,
        price: 2999,
      },
    ],
    subtotal: 2999,
    vat: 0,
    total: 2999,
    bankgiro: '5XXX-XXXX',
    reference: 'LT-0001',
  };

  const fmt = (n) => n.toLocaleString('sv-SE') + ' kr';

  return (
    <div style={{
      minHeight: '100vh',
      background: colors.bg,
      padding: '32px 16px',
      fontFamily: '"DM Sans", system-ui, sans-serif',
      fontSize: 14,
      color: colors.text,
      lineHeight: 1.5,
    }}>
      <div style={{
        maxWidth: 680,
        margin: '0 auto',
        background: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
      }}>
        
        {/* Header */}
        <div style={{
          padding: '24px 32px',
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              background: colors.primary,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 14, color: '#fff' }}>Le</span>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: colors.primary }}>LeTrend</div>
              <div style={{ fontSize: 12, color: colors.textMuted }}>{invoice.from.org}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: colors.primary }}>FAKTURA</div>
            <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>{invoice.number}</div>
          </div>
        </div>

        {/* Info-grid */}
        <div style={{
          padding: '24px 32px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 24,
          borderBottom: `1px solid ${colors.border}`,
          fontSize: 13,
        }}>
          <div>
            <div style={{ color: colors.textMuted, marginBottom: 4 }}>Fakturadatum</div>
            <div style={{ fontWeight: 500 }}>{invoice.issued}</div>
          </div>
          <div>
            <div style={{ color: colors.textMuted, marginBottom: 4 }}>Förfallodatum</div>
            <div style={{ fontWeight: 500 }}>{invoice.due}</div>
          </div>
          <div>
            <div style={{ color: colors.textMuted, marginBottom: 4 }}>Referens</div>
            <div style={{ fontWeight: 500 }}>{invoice.reference}</div>
          </div>
        </div>

        {/* Adresser */}
        <div style={{
          padding: '24px 32px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 48,
          borderBottom: `1px solid ${colors.border}`,
          fontSize: 13,
        }}>
          <div>
            <div style={{ color: colors.textMuted, marginBottom: 8, fontWeight: 500 }}>Avsändare</div>
            <div>{invoice.from.name}</div>
            <div>{invoice.from.address}</div>
            <div>{invoice.from.postal}</div>
            <div style={{ marginTop: 8, color: colors.textMuted }}>{invoice.from.phone}</div>
            <div style={{ color: colors.textMuted }}>{invoice.from.email}</div>
          </div>
          <div>
            <div style={{ color: colors.textMuted, marginBottom: 8, fontWeight: 500 }}>Mottagare</div>
            <div>{invoice.to.name}</div>
            <div>{invoice.to.address}</div>
            <div>{invoice.to.postal}</div>
            <div style={{ marginTop: 8, color: colors.textMuted }}>{invoice.to.email}</div>
          </div>
        </div>

        {/* Specifikation */}
        <div style={{ padding: '24px 32px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
                <th style={{ textAlign: 'left', padding: '8px 0', color: colors.textMuted, fontWeight: 500 }}>Beskrivning</th>
                <th style={{ textAlign: 'center', padding: '8px 0', color: colors.textMuted, fontWeight: 500, width: 60 }}>Antal</th>
                <th style={{ textAlign: 'right', padding: '8px 0', color: colors.textMuted, fontWeight: 500, width: 100 }}>À-pris</th>
                <th style={{ textAlign: 'right', padding: '8px 0', color: colors.textMuted, fontWeight: 500, width: 100 }}>Belopp</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <td style={{ padding: '12px 0' }}>
                    <div>{item.description}</div>
                    <div style={{ fontSize: 12, color: colors.textMuted }}>{item.period}</div>
                  </td>
                  <td style={{ textAlign: 'center', padding: '12px 0' }}>{item.qty}</td>
                  <td style={{ textAlign: 'right', padding: '12px 0' }}>{fmt(item.price)}</td>
                  <td style={{ textAlign: 'right', padding: '12px 0' }}>{fmt(item.price * item.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Summering */}
          <div style={{ 
            marginTop: 16, 
            marginLeft: 'auto', 
            width: 240,
            fontSize: 13,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span style={{ color: colors.textMuted }}>Netto</span>
              <span>{fmt(invoice.subtotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span style={{ color: colors.textMuted }}>Moms (0%)</span>
              <span>{fmt(invoice.vat)}</span>
            </div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              padding: '12px 0 6px',
              borderTop: `2px solid ${colors.primary}`,
              marginTop: 8,
              fontWeight: 600,
              fontSize: 15,
            }}>
              <span>Att betala</span>
              <span>{fmt(invoice.total)}</span>
            </div>
          </div>
        </div>

        {/* Betalningsinformation */}
        <div style={{
          margin: '0 32px 24px',
          padding: 20,
          background: colors.muted,
          borderRadius: 6,
          fontSize: 13,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 12, color: colors.primary }}>Betalningsinformation</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ color: colors.textMuted }}>Bankgiro</div>
              <div style={{ fontWeight: 500, fontFamily: 'monospace' }}>{invoice.bankgiro}</div>
            </div>
            <div>
              <div style={{ color: colors.textMuted }}>Belopp</div>
              <div style={{ fontWeight: 500 }}>{fmt(invoice.total)}</div>
            </div>
            <div>
              <div style={{ color: colors.textMuted }}>OCR/Referens</div>
              <div style={{ fontWeight: 500, fontFamily: 'monospace' }}>{invoice.reference}</div>
            </div>
            <div>
              <div style={{ color: colors.textMuted }}>Förfaller</div>
              <div style={{ fontWeight: 500 }}>{invoice.due}</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 32px',
          borderTop: `1px solid ${colors.border}`,
          fontSize: 12,
          color: colors.textMuted,
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          <span>Vid frågor, kontakta {invoice.from.email}</span>
          <span>Sida 1 av 1</span>
        </div>
      </div>
    </div>
  );
}
