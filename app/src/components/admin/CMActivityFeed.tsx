'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { LeTrendColors, LeTrendTypography, LeTrendRadius } from '@/styles/letrend-design-system';

interface Activity {
  id: string;
  cm_email: string;
  customer_profile_id?: string;
  activity_type: string;
  description: string;
  metadata: Record<string, any>;
  created_at: string;
  customer_profiles?: {
    business_name: string;
    logo_url?: string;
  };
}

interface CMActivityFeedProps {
  limit?: number;
  cmEmail?: string; // Filter by specific CM
}

export function CMActivityFeed({ limit = 20, cmEmail }: CMActivityFeedProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivities();
  }, [cmEmail, limit]);

  const fetchActivities = async () => {
    try {
      setLoading(true);

      let query = supabase
        .from('cm_activities')
        .select(`
          *,
          customer_profiles (
            business_name,
            logo_url
          )
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (cmEmail) {
        query = query.eq('cm_email', cmEmail);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[CMActivityFeed] Error fetching activities:', error);
        return;
      }

      setActivities(data || []);
    } catch (err) {
      console.error('[CMActivityFeed] Unexpected error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatRelativeTime = (timestamp: string): string => {
    const now = new Date().getTime();
    const then = new Date(timestamp).getTime();
    const diffMs = now - then;

    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);

    if (minutes < 1) return 'Nyss';
    if (minutes < 60) return `${minutes}m sedan`;
    if (hours < 24) return `${hours}h sedan`;
    if (days === 1) return 'Igår';
    if (days < 7) return `${days}d sedan`;

    return new Date(timestamp).toLocaleDateString('sv-SE', {
      month: 'short',
      day: 'numeric',
    });
  };

  const getActivityIcon = (activityType: string): string => {
    switch (activityType) {
      case 'concept_added':
        return '🎬';
      case 'concept_removed':
        return '🗑️';
      case 'concept_customized':
        return '✏️';
      case 'email_sent':
        return '📧';
      case 'gameplan_updated':
        return '📋';
      case 'customer_created':
        return '✨';
      case 'customer_updated':
        return '📝';
      case 'customer_invited':
        return '📨';
      default:
        return '📌';
    }
  };

  const getActivityColor = (activityType: string): string => {
    switch (activityType) {
      case 'concept_added':
        return LeTrendColors.success;
      case 'concept_removed':
        return LeTrendColors.error;
      case 'concept_customized':
        return LeTrendColors.warning;
      case 'email_sent':
        return '#2563EB';
      case 'gameplan_updated':
        return LeTrendColors.brownLight;
      case 'customer_created':
      case 'customer_invited':
        return LeTrendColors.success;
      default:
        return LeTrendColors.textSecondary;
    }
  };

  if (loading) {
    return (
      <div style={{
        background: LeTrendColors.cream,
        borderRadius: LeTrendRadius.lg,
        padding: 32,
        textAlign: 'center',
        color: LeTrendColors.textSecondary,
        border: `1px solid ${LeTrendColors.border}`
      }}>
        Laddar aktiviteter...
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div style={{
        background: LeTrendColors.cream,
        borderRadius: LeTrendRadius.lg,
        padding: 32,
        textAlign: 'center',
        border: `1px solid ${LeTrendColors.border}`
      }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
        <div style={{
          fontSize: 14,
          fontWeight: 500,
          color: LeTrendColors.textSecondary
        }}>
          Inga aktiviteter ännu
        </div>
        <div style={{
          fontSize: 13,
          marginTop: 4,
          color: LeTrendColors.textMuted
        }}>
          Content Manager-aktiviteter visas här
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {activities.map((activity) => {
        const activityColor = getActivityColor(activity.activity_type);

        return (
          <div
            key={activity.id}
            style={{
              background: LeTrendColors.cream,
              border: `1px solid ${LeTrendColors.border}`,
              borderRadius: LeTrendRadius.lg,
              padding: 16,
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              transition: 'transform 0.2s, box-shadow 0.2s',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(74, 47, 24, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {/* Customer Avatar or Activity Icon */}
            <div style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: activity.customer_profiles?.logo_url
                ? `url(${activity.customer_profiles.logo_url}) center/cover`
                : `rgba(${activityColor === LeTrendColors.success ? '90, 143, 90' : '107, 68, 35'}, 0.15)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              flexShrink: 0,
              border: `2px solid ${LeTrendColors.border}`,
              color: LeTrendColors.brownDark,
              fontWeight: 700,
              fontFamily: LeTrendTypography.fontFamily.heading
            }}>
              {activity.customer_profiles?.logo_url ? null : (
                activity.customer_profiles?.business_name?.[0] || getActivityIcon(activity.activity_type)
              )}
            </div>

            {/* Activity Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* CM Email */}
              <div style={{
                fontSize: 13,
                fontWeight: 600,
                color: LeTrendColors.brownDark,
                marginBottom: 2
              }}>
                {activity.cm_email}
              </div>

              {/* Description */}
              <div style={{
                fontSize: 14,
                color: LeTrendColors.textPrimary,
                marginBottom: 4
              }}>
                {activity.description}
              </div>

              {/* Metadata */}
              {activity.customer_profiles && (
                <div style={{
                  fontSize: 12,
                  color: LeTrendColors.textSecondary,
                  marginTop: 4
                }}>
                  📍 {activity.customer_profiles.business_name}
                </div>
              )}

              {/* Timestamp */}
              <div style={{
                fontSize: 11,
                color: LeTrendColors.textMuted,
                marginTop: 4
              }}>
                {formatRelativeTime(activity.created_at)}
              </div>
            </div>

            {/* Activity Type Badge */}
            <div style={{
              background: `rgba(${activityColor === LeTrendColors.success ? '90, 143, 90' : activityColor === LeTrendColors.error ? '197, 48, 48' : '107, 68, 35'}, 0.1)`,
              color: activityColor,
              padding: '4px 10px',
              borderRadius: LeTrendRadius.md,
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              border: `1px solid ${activityColor}20`
            }}>
              {getActivityIcon(activity.activity_type)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
