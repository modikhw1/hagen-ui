'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';

interface StudioStats {
  totalConcepts: number;
  totalCustomers: number;
  pendingInvites: number;
  recentUploads: number;
}

interface RecentActivity {
  id: string;
  type: 'concept_created' | 'customer_added' | 'invite_sent' | 'video_uploaded';
  description: string;
  timestamp: string;
}

export default function StudioDashboard() {
  const [stats, setStats] = useState<StudioStats>({
    totalConcepts: 0,
    totalCustomers: 0,
    pendingInvites: 0,
    recentUploads: 0,
  });
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch customer count
      const { count: customerCount } = await supabase
        .from('customer_profiles')
        .select('*', { count: 'exact', head: true });

      // Fetch pending invites
      const { count: pendingCount } = await supabase
        .from('customer_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      setStats({
        totalConcepts: 19, // TODO: Move to database
        totalCustomers: customerCount || 0,
        pendingInvites: pendingCount || 0,
        recentUploads: 0, // TODO: Track uploads
      });

      // Mock activities for now
      setActivities([
        {
          id: '1',
          type: 'customer_added',
          description: 'Ny kund lades till: Café Månsson',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: '2',
          type: 'invite_sent',
          description: 'Inbjudan skickad till restaurang@email.se',
          timestamp: new Date(Date.now() - 7200000).toISOString(),
        },
      ]);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    
    if (hours < 1) return 'För less än en timme sedan';
    if (hours < 24) return `För ${hours} timmar sedan`;
    return date.toLocaleDateString('sv-SE');
  };

  const getActivityIcon = (type: RecentActivity['type']) => {
    switch (type) {
      case 'concept_created': return '🎬';
      case 'customer_added': return '👤';
      case 'invite_sent': return '📧';
      case 'video_uploaded': return '📹';
      default: return '📌';
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
        Laddar dashboard...
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '24px', color: '#1a1a2e' }}>
        CM Dashboard
      </h1>

      {/* Stats Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '16px',
        marginBottom: '32px'
      }}>
        <div style={{ 
          background: '#fff', 
          borderRadius: '12px', 
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Concepts</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#1a1a2e' }}>{stats.totalConcepts}</div>
        </div>

        <div style={{ 
          background: '#fff', 
          borderRadius: '12px', 
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Kunder</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#1a1a2e' }}>{stats.totalCustomers}</div>
        </div>

        <div style={{ 
          background: '#fff', 
          borderRadius: '12px', 
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Väntande inbjudningar</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#f59e0b' }}>{stats.pendingInvites}</div>
        </div>

        <div style={{ 
          background: '#fff', 
          borderRadius: '12px', 
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Nya uploads</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#10b981' }}>{stats.recentUploads}</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: '#1a1a2e' }}>
          Snabba åtgärder
        </h2>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <a 
            href="/studio/upload"
            style={{
              background: '#4f46e5',
              color: '#fff',
              padding: '12px 20px',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            📹 Ladda upp video
          </a>
          <a 
            href="/studio/concepts"
            style={{
              background: '#fff',
              color: '#1a1a2e',
              padding: '12px 20px',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 500,
              border: '1px solid #e5e7eb',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            🎬 Visa concepts
          </a>
          <a 
            href="/studio/customers"
            style={{
              background: '#fff',
              color: '#1a1a2e',
              padding: '12px 20px',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 500,
              border: '1px solid #e5e7eb',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            👤 Hantera kunder
          </a>
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: '#1a1a2e' }}>
          Senaste aktiviteter
        </h2>
        <div style={{ 
          background: '#fff', 
          borderRadius: '12px', 
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          {activities.length === 0 ? (
            <div style={{ padding: '20px', color: '#6b7280', textAlign: 'center' }}>
              Ingen aktivitet ännu
            </div>
          ) : (
            activities.map((activity, index) => (
              <div 
                key={activity.id}
                style={{
                  padding: '16px 20px',
                  borderBottom: index < activities.length - 1 ? '1px solid #f3f4f6' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}
              >
                <span style={{ fontSize: '20px' }}>{getActivityIcon(activity.type)}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#1a1a2e', fontSize: '14px' }}>{activity.description}</div>
                  <div style={{ color: '#9ca3af', fontSize: '12px' }}>{formatTime(activity.timestamp)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
