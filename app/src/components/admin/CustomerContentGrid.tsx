'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { LeTrendColors, LeTrendTypography, LeTrendRadius } from '@/styles/letrend-design-system';

interface CustomerProfile {
  id: string;
  business_name: string;
  logo_url?: string;
  status: string;
  contact_email: string;
  concepts?: Array<{ concept_id: string; match_percentage: number }>;
  game_plan?: { notes: Array<any> };
  created_at: string;
}

interface CustomerContentGridProps {
  limit?: number;
  statusFilter?: string[];
}

export function CustomerContentGrid({ limit = 12, statusFilter = ['active', 'agreed'] }: CustomerContentGridProps) {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCustomers();
  }, [statusFilter, limit]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);

      let query = supabase
        .from('customer_profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (statusFilter && statusFilter.length > 0) {
        query = query.in('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[CustomerContentGrid] Error fetching customers:', error);
        return;
      }

      setCustomers(data || []);
    } catch (err) {
      console.error('[CustomerContentGrid] Unexpected error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getConceptCount = (customer: CustomerProfile): number => {
    return customer.concepts?.length || 0;
  };

  const getGamePlanCompletion = (customer: CustomerProfile): number => {
    const notes = customer.game_plan?.notes || [];
    if (notes.length === 0) return 0;

    // Simple completion calculation based on note count
    // You can make this more sophisticated based on actual completion logic
    const maxNotes = 10; // Assumed max for 100% completion
    return Math.min(100, Math.round((notes.length / maxNotes) * 100));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
      case 'agreed':
        return { color: LeTrendColors.success, label: 'Aktiv', bg: 'rgba(90, 143, 90, 0.1)' };
      case 'pending':
        return { color: LeTrendColors.warning, label: 'Väntande', bg: 'rgba(217, 119, 6, 0.1)' };
      case 'invited':
        return { color: '#2563EB', label: 'Inbjuden', bg: 'rgba(37, 99, 235, 0.1)' };
      case 'paused':
        return { color: '#9ca3af', label: 'Pausad', bg: 'rgba(156, 163, 175, 0.1)' };
      default:
        return { color: LeTrendColors.textMuted, label: status, bg: 'rgba(157, 142, 125, 0.1)' };
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 16,
      }}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              background: LeTrendColors.surface,
              borderRadius: LeTrendRadius.lg,
              padding: 20,
              border: `1px solid ${LeTrendColors.border}`,
              height: 200,
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        ))}
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div style={{
        background: LeTrendColors.cream,
        borderRadius: LeTrendRadius.lg,
        padding: 40,
        textAlign: 'center',
        border: `1px solid ${LeTrendColors.border}`,
      }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
        <div style={{
          fontSize: 14,
          fontWeight: 500,
          color: LeTrendColors.textSecondary,
        }}>
          Inga kunder att visa
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: 16,
    }}>
      {customers.map((customer) => {
        const conceptCount = getConceptCount(customer);
        const gamePlanCompletion = getGamePlanCompletion(customer);
        const statusBadge = getStatusBadge(customer.status);

        return (
          <a
            key={customer.id}
            href={`/studio/customers/${customer.id}`}
            style={{
              background: LeTrendColors.cream,
              borderRadius: LeTrendRadius.lg,
              padding: 20,
              border: `1px solid ${LeTrendColors.border}`,
              textDecoration: 'none',
              display: 'flex',
              flexDirection: 'column',
              transition: 'transform 0.2s, box-shadow 0.2s',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 8px 20px rgba(74, 47, 24, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {/* Header with Logo/Initial + Status */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              marginBottom: 16,
            }}>
              {/* Logo/Avatar */}
              <div style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: customer.logo_url
                  ? `url(${customer.logo_url}) center/cover`
                  : LeTrendColors.brownLight,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 20,
                fontWeight: 700,
                fontFamily: LeTrendTypography.fontFamily.heading,
                flexShrink: 0,
                border: `2px solid ${LeTrendColors.border}`,
              }}>
                {!customer.logo_url && customer.business_name[0].toUpperCase()}
              </div>

              {/* Business Name + Status */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: LeTrendColors.brownDark,
                  marginBottom: 4,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {customer.business_name}
                </div>
                <div style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: LeTrendRadius.md,
                  fontSize: 10,
                  fontWeight: 600,
                  background: statusBadge.bg,
                  color: statusBadge.color,
                  border: `1px solid ${statusBadge.color}40`,
                }}>
                  {statusBadge.label}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginTop: 'auto',
            }}>
              {/* Concepts */}
              <div style={{
                background: LeTrendColors.surface,
                borderRadius: LeTrendRadius.md,
                padding: 12,
                border: `1px solid ${LeTrendColors.border}`,
              }}>
                <div style={{
                  fontSize: 11,
                  color: LeTrendColors.textSecondary,
                  marginBottom: 4,
                  fontWeight: 600,
                }}>
                  Koncept
                </div>
                <div style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: conceptCount > 0 ? LeTrendColors.success : LeTrendColors.textMuted,
                }}>
                  {conceptCount}
                </div>
              </div>

              {/* Game Plan */}
              <div style={{
                background: LeTrendColors.surface,
                borderRadius: LeTrendRadius.md,
                padding: 12,
                border: `1px solid ${LeTrendColors.border}`,
              }}>
                <div style={{
                  fontSize: 11,
                  color: LeTrendColors.textSecondary,
                  marginBottom: 4,
                  fontWeight: 600,
                }}>
                  Game Plan
                </div>
                <div style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: gamePlanCompletion > 50 ? LeTrendColors.success : gamePlanCompletion > 0 ? LeTrendColors.warning : LeTrendColors.textMuted,
                }}>
                  {gamePlanCompletion}%
                </div>
              </div>
            </div>

            {/* Quick Info */}
            <div style={{
              marginTop: 12,
              fontSize: 11,
              color: LeTrendColors.textMuted,
            }}>
              {customer.contact_email}
            </div>
          </a>
        );
      })}
    </div>
  );
}
