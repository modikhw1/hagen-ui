'use client';

import { useEffect, useRef } from 'react';
import { useLocation as _useLocation } from 'wouter';
const usePathname = () => _useLocation()[0];
import * as Sentry from '@sentry/browser';
import posthog from 'posthog-js';
import { useAuth } from '@/contexts/AuthContext';

const sentryDsn = import.meta.env.VITE_SENTRY_DSN?.trim();
const sentryEnvironment =
  import.meta.env.VITE_SENTRY_ENVIRONMENT?.trim() ||
  import.meta.env.VITE_ENV?.trim() ||
  import.meta.env.MODE;
const posthogKey = import.meta.env.VITE_POSTHOG_KEY?.trim();
const posthogHost =
  import.meta.env.VITE_POSTHOG_HOST?.trim() || 'https://eu.i.posthog.com';

export function ObservabilityProvider() {
  const { user, profile, authLoading } = useAuth();
  const pathname = usePathname() ?? '';
  const initializedRef = useRef(false);
  const lastPageviewRef = useRef<string | null>(null);

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }

    if (sentryDsn) {
      Sentry.init({
        dsn: sentryDsn,
        environment: sentryEnvironment,
      });
      window.Sentry = Sentry;
    }

    if (posthogKey) {
      posthog.init(posthogKey, {
        api_host: posthogHost,
        capture_pageview: false,
        autocapture: false,
        person_profiles: 'identified_only',
      });
      window.posthog = posthog;
    }

    initializedRef.current = true;
  }, []);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      Sentry.setUser(null);
      if (posthogKey) {
        posthog.reset();
      }
      return;
    }

    const sentryUser = {
      id: user.id,
      email: user.email ?? profile?.email ?? undefined,
      role: profile?.role ?? undefined,
    };

    Sentry.setUser(sentryUser);
    Sentry.setTag('app_area', pathname.startsWith('/admin') ? 'admin' : pathname.startsWith('/studio') ? 'studio' : 'app');

    if (posthogKey) {
      posthog.identify(user.id, {
        email: user.email ?? profile?.email ?? undefined,
        role: profile?.role ?? undefined,
        is_admin: profile?.is_admin ?? undefined,
      });
    }
  }, [authLoading, pathname, profile, user]);

  useEffect(() => {
    const isAdminSurface = pathname.startsWith('/admin') || pathname.startsWith('/studio');
    if (!isAdminSurface) {
      return;
    }

    const query =
      typeof window !== 'undefined'
        ? window.location.search.replace(/^\?/, '')
        : '';
    const target = query ? `${pathname}?${query}` : pathname;
    if (lastPageviewRef.current === target) {
      return;
    }

    lastPageviewRef.current = target;

    Sentry.addBreadcrumb({
      category: 'navigation',
      message: 'admin.pageview',
      level: 'info',
      data: { path: pathname, query: query || null },
    });

    if (posthogKey) {
      posthog.capture('admin.pageview', {
        path: pathname,
        query: query || null,
      });
    }
  }, [pathname]);

  return null;
}
