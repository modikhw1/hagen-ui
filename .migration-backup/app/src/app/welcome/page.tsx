'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { onboardingTheme as t } from '@/lib/onboarding/theme';
import { getOnboardingProfileId, clearOnboardingSession } from '@/lib/onboarding/session';
import { WelcomeHero } from '@/components/onboarding/WelcomeHero';
import { ContentManagerCard } from '@/components/onboarding/ContentManagerCard';
import { TikTokProfileCard } from '@/components/onboarding/TikTokProfileCard';
import { ProcessTimeline } from '@/components/onboarding/ProcessTimeline';
import { PackageSummary } from '@/components/onboarding/PackageSummary';
import { OnboardingCTA } from '@/components/onboarding/OnboardingCTA';
import { GamePlanPreviewCard } from '@/components/onboarding/GamePlanPreviewCard';

interface WelcomeContext {
  customer: { businessName: string; tiktokHandle: string | null; tiktokProfileUrl: string | null };
  contentManager: { name: string; avatarUrl: string | null; email: string | null } | null;
  subscription: {
    pricePerMonth: number;
    interval: string;
    scopeItems: string[];
    invoiceText: string | null;
    firstInvoiceBehavior: string;
    billingDayOfMonth: number;
  };
  process: { steps: Array<{ number: string; title: string; description: string }> };
  gamePlan: {
    hasGamePlan: boolean;
    title: string | null;
    description: string | null;
    goals: string[];
    updatedAt: string | null;
  };
}

export default function WelcomePage() {
  const router = useRouter();
  const [context, setContext] = useState<WelcomeContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login?redirect=/welcome');
        return;
      }

      const profileId = getOnboardingProfileId();
      if (!profileId) {
        // No profile linked — redirect to feed (returning user) or login
        router.replace('/feed');
        return;
      }

      try {
        const res = await fetch(`/api/onboarding/welcome-context?profileId=${encodeURIComponent(profileId)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Kunde inte hämta data');
        }
        const data: WelcomeContext = await res.json();
        setContext(data);
      } catch (err) {
        console.error('Failed to fetch welcome context:', err);
        setError(err instanceof Error ? err.message : 'Något gick fel');
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [router]);

  const handleCheckout = () => {
    router.push('/checkout');
  };

  const handleExplore = () => {
    clearOnboardingSession();
    router.push('/feed');
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: `linear-gradient(180deg, ${t.bg.primary} 0%, ${t.bg.secondary} 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            border: `3px solid ${t.border.light}`,
            borderTopColor: t.brand.primary,
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !context) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: `linear-gradient(180deg, ${t.bg.primary} 0%, ${t.bg.secondary} 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <p style={{ color: '#DC2626', marginBottom: '16px' }}>{error || 'Något gick fel'}</p>
          <button
            onClick={() => router.push('/login')}
            style={{
              padding: '12px 24px',
              background: t.brand.dark,
              color: t.bg.primary,
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Tillbaka till inloggning
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: `linear-gradient(180deg, ${t.bg.primary} 0%, ${t.bg.secondary} 100%)`,
      }}
    >
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
        {/* 1. Hero */}
        <WelcomeHero businessName={context.customer.businessName} />

        {/* 2. Content Manager */}
        {context.contentManager && (
          <ContentManagerCard
            name={context.contentManager.name}
            avatarUrl={context.contentManager.avatarUrl}
            email={context.contentManager.email}
          />
        )}

        {/* 3. TikTok (conditional) */}
        {(context.customer.tiktokHandle || context.customer.tiktokProfileUrl) && (
          <TikTokProfileCard
            handle={context.customer.tiktokHandle || ''}
            profileUrl={context.customer.tiktokProfileUrl}
          />
        )}

        {/* 4. Process Timeline */}
        <ProcessTimeline steps={context.process.steps} />

        {/* 5. Personal Game Plan Preview */}
        {context.gamePlan?.hasGamePlan ? (
          <GamePlanPreviewCard
            title={context.gamePlan.title}
            description={context.gamePlan.description}
            goals={context.gamePlan.goals}
            updatedAt={context.gamePlan.updatedAt}
          />
        ) : null}

        {/* 6. Package Summary */}
        <PackageSummary
          pricePerMonth={context.subscription.pricePerMonth}
          interval={context.subscription.interval}
          scopeItems={context.subscription.scopeItems}
        />

        {/* 7. CTA */}
        <OnboardingCTA onCheckout={handleCheckout} onExplore={handleExplore} />
      </div>
    </div>
  );
}
