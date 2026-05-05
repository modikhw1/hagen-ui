import { useEffect, useState } from 'react';
import { useParams } from '@/lib/navigation-compat';
import { DemoLandingView, type DemoPreviewPayload } from './DemoLandingView';

export default function DemoLandingPage() {
  const { token } = useParams() as { token: string };
  const [payload, setPayload] = useState<DemoPreviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setNotFound(false);
      setErrorMessage(null);
      try {
        const response = await fetch(`/api/public/demos/${encodeURIComponent(token)}`);
        const raw = await response.text().catch(() => '');
        const data = raw ? tryParseJson(raw) : null;
        if (!response.ok || !data) {
          if (!cancelled) {
            if (response.status === 404) {
              setNotFound(true);
            } else {
              setErrorMessage(readErrorMessage(data, raw));
            }
          }
          return;
        }
        if (!cancelled) setPayload(data as DemoPreviewPayload);
      } catch (err) {
        console.error('Demo preview load error', err);
        if (!cancelled) setErrorMessage('Kunde inte ladda demo just nu.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <span className="text-sm">Laddar demo...</span>
      </main>
    );
  }

  if (errorMessage) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-bold">Demot kunde inte laddas</h1>
          <p className="mt-3 text-sm text-muted-foreground">{errorMessage}</p>
        </div>
      </main>
    );
  }

  if (notFound || !payload) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-bold">Länken är inte giltig</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Demot kan ha tagits bort, gått ut eller så är länken felaktig. Hör av dig till oss så
            skickar vi en ny.
          </p>
        </div>
      </main>
    );
  }

  return <DemoLandingView payload={payload} />;
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readErrorMessage(data: unknown, raw: string) {
  if (data && typeof data === 'object') {
    const payload = data as { error?: unknown; message?: unknown };
    if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
    if (typeof payload.message === 'string' && payload.message.trim()) return payload.message;
  }

  const text = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const routeMiss = text.match(/\bCannot\s+(GET|POST|PATCH|DELETE)\s+\S+/i);
  if (routeMiss?.[0]) {
    return `API-servern saknar preview-endpointen (${routeMiss[0]}).`;
  }
  return text || 'Kunde inte ladda demo just nu.';
}
