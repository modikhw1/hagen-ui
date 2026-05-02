'use client';

type TelemetryPayload = Record<string, unknown>;

type SentryLike = {
  addBreadcrumb?: (breadcrumb: {
    category?: string;
    message?: string;
    level?: 'info' | 'error' | 'warning';
    data?: TelemetryPayload;
  }) => void;
  captureException?: (error: unknown, context?: { tags?: Record<string, string> }) => void;
};

type PostHogLike = {
  capture?: (event: string, properties?: TelemetryPayload) => void;
};

declare global {
  interface Window {
    Sentry?: SentryLike;
    posthog?: PostHogLike;
  }
}

function getWindow() {
  return typeof window === 'undefined' ? null : window;
}

function compactPayload(payload?: TelemetryPayload) {
  if (!payload) return undefined;

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

export function addAdminBreadcrumb(action: string, payload?: TelemetryPayload) {
  const currentWindow = getWindow();
  const data = compactPayload(payload);

  currentWindow?.Sentry?.addBreadcrumb?.({
    category: 'admin.action',
    message: action,
    level: 'info',
    data,
  });

  currentWindow?.posthog?.capture?.(action, data);
}

export function captureAdminMetric(
  metricName: string,
  durationMs: number,
  payload?: TelemetryPayload,
) {
  const currentWindow = getWindow();
  const data = compactPayload({
    duration_ms: Math.round(durationMs),
    ...payload,
  });

  currentWindow?.Sentry?.addBreadcrumb?.({
    category: 'admin.metric',
    message: metricName,
    level: 'info',
    data,
  });

  currentWindow?.posthog?.capture?.(metricName, data);
}

export function captureAdminError(action: string, error: unknown, payload?: TelemetryPayload) {
  const currentWindow = getWindow();
  const data = compactPayload({
    ...payload,
    error_message: error instanceof Error ? error.message : String(error),
  });

  currentWindow?.Sentry?.addBreadcrumb?.({
    category: 'admin.error',
    message: action,
    level: 'error',
    data,
  });
  currentWindow?.Sentry?.captureException?.(error, {
    tags: { area: 'admin', action },
  });

  currentWindow?.posthog?.capture?.(`${action}.error`, data);
}

export async function measureAdminAsync<T>(
  metricName: string,
  task: () => Promise<T>,
  payload?: TelemetryPayload,
) {
  const startedAt =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  const result = await task();

  const finishedAt =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  captureAdminMetric(metricName, finishedAt - startedAt, payload);
  return result;
}
