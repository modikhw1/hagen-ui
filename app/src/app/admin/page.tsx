'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { isStripeTestMode } from '@/lib/stripe/dynamic-config';
import { LeTrendColors, LeTrendGradients, LeTrendTypography, LeTrendRadius } from '@/styles/letrend-design-system';
import { CMActivityFeed } from '@/components/admin/CMActivityFeed';

interface Stats {
  totalCustomers: number;
  activeCustomers: number;
  mrr: number;
  pendingInvites: number;
}

export default function AdminDashboard() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<Stats>({ totalCustomers: 0, activeCustomers: 0, mrr: 0, pendingInvites: 0 });
  const [loading, setLoading] = useState(true);
  const [showStripeEmbed, setShowStripeEmbed] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) { window.location.href = '/login'; return; }
    fetchStats();
  }, [authLoading, user]);

  const fetchStats = async () => {
    try {
      const { data: profiles } = await supabase.from('customer_profiles').select('*');
      const active = profiles?.filter(p => p.status === 'active' || p.status === 'agreed') || [];
      const pending = profiles?.filter(p => p.status === 'pending' || p.status === 'invited') || [];
      
      setStats({
        totalCustomers: profiles?.length || 0,
        activeCustomers: active.length,
        mrr: active.reduce((sum, c) => sum + (c.monthly_price || 0), 0),
        pendingInvites: pending.length,
      });
    } catch (err) { console.error('Error:', err); }
    finally { setLoading(false); }
  };

  const menuItems = [
    { href: '/admin/customers', icon: '👥', title: 'Kunder', desc: 'Hantera, invitera, filtrera' },
    { href: '/admin/subscriptions', icon: '🔄', title: 'Abonnemang', desc: 'Priser, schema, ändra/avsluta' },
    { href: '/admin/invoices', icon: '📄', title: 'Fakturor', desc: 'Betalningshistorik' },
    { href: '/admin/team', icon: '👨‍💼', title: 'Team', desc: 'Content Managers' },
  ];

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Laddar...</div>;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, fontFamily: LeTrendTypography.fontFamily.heading, color: LeTrendColors.brownDark, marginBottom: '4px' }}>Admin</h1>
        <p style={{ color: LeTrendColors.textSecondary, fontSize: '14px', margin: 0 }}>Översikt över verksamheten</p>
      </div>

      {/* MRR Banner */}
      <div style={{
        background: LeTrendGradients.brownLight,
        borderRadius: LeTrendRadius.xl,
        padding: '28px 32px',
        marginBottom: '24px',
        color: LeTrendColors.cream,
        boxShadow: '0 4px 16px rgba(74, 47, 24, 0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '4px' }}>MRR</div>
            <div style={{ fontSize: '48px', fontWeight: 700 }}>{stats.mrr.toLocaleString()} kr</div>
            <div style={{ fontSize: '13px', opacity: 0.8, marginTop: '4px' }}>{stats.activeCustomers} aktiva kunder</div>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              onClick={() => setShowStripeEmbed(!showStripeEmbed)}
              style={{
                background: 'rgba(255,255,255,0.2)',
                color: '#fff',
                padding: '12px 20px',
                borderRadius: '10px',
                border: 'none',
                fontSize: '14px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
            >
              {showStripeEmbed ? '📊 Dölj Stripe' : '📊 Visa Stripe'}
            </button>
            <a
              href={isStripeTestMode ? 'https://dashboard.stripe.com/test' : 'https://dashboard.stripe.com'}
              target="_blank"
              rel="noopener"
              style={{
                background: 'rgba(255,255,255,0.2)',
                color: '#fff',
                padding: '12px 20px',
                borderRadius: '10px',
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              Öppna Stripe ↗
            </a>
          </div>
        </div>

        {/* Stripe Embed - Collapsible */}
        {showStripeEmbed && (
          <div style={{
            marginTop: '24px',
            paddingTop: '24px',
            borderTop: '1px solid rgba(255,255,255,0.2)',
          }}>
            <div style={{
              background: 'rgba(255,255,255,0.95)',
              borderRadius: LeTrendRadius.lg,
              padding: '16px',
              minHeight: '400px',
            }}>
              <iframe
                src={isStripeTestMode
                  ? 'https://dashboard.stripe.com/test/dashboard'
                  : 'https://dashboard.stripe.com/dashboard'}
                style={{
                  width: '100%',
                  height: '450px',
                  border: 'none',
                  borderRadius: '8px',
                }}
                title="Stripe Dashboard"
              />
              <div style={{
                textAlign: 'center',
                marginTop: '12px',
                fontSize: '12px',
                color: LeTrendColors.textSecondary,
              }}>
                <span style={{ opacity: 0.7 }}>
                  {isStripeTestMode ? '⚠️ Test Mode' : '✓ Live Mode'} - För fullständig funktionalitet,
                  <a
                    href={isStripeTestMode ? 'https://dashboard.stripe.com/test' : 'https://dashboard.stripe.com'}
                    target="_blank"
                    rel="noopener"
                    style={{ color: LeTrendColors.brownDark, marginLeft: '4px' }}
                  >
                    öppna i ny flik ↗
                  </a>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '32px' }}>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Totalt kunder</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#1a1a2e' }}>{stats.totalCustomers}</div>
        </div>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Aktiva</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#10b981' }}>{stats.activeCustomers}</div>
        </div>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Väntande</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#f59e0b' }}>{stats.pendingInvites}</div>
        </div>
      </div>

      {/* Menu Cards */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1a1a2e', marginBottom: '16px' }}>Hantera</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          {menuItems.map(item => (
            <a 
              key={item.href}
              href={item.href} 
              style={{ 
                background: '#fff', 
                borderRadius: '12px', 
                padding: '20px', 
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)', 
                textDecoration: 'none',
                display: 'block',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
              onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
              onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'; }}
            >
              <div style={{ fontSize: '28px', marginBottom: '12px' }}>{item.icon}</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a2e', marginBottom: '4px' }}>{item.title}</div>
              <div style={{ fontSize: '13px', color: '#6b7280' }}>{item.desc}</div>
            </a>
          ))}
        </div>
      </div>

      {/* CM Activity Feed */}
      <div>
        <h2 style={{
          fontSize: '18px',
          fontWeight: 600,
          color: LeTrendColors.brownDark,
          marginBottom: '16px',
          fontFamily: LeTrendTypography.fontFamily.heading
        }}>Senaste aktiviteter</h2>
        <p style={{
          fontSize: '13px',
          color: LeTrendColors.textSecondary,
          marginBottom: '16px',
          marginTop: '-8px'
        }}>
          Vad Content Managers gör i Studio
        </p>
        <CMActivityFeed limit={10} />
      </div>
    </div>
  );
}
