import { useEffect, useState } from 'react';
import { useParams } from '@/lib/navigation-compat';
import { DemoLandingView, type DemoPreviewPayload } from './DemoLandingView';

export default function DemoLandingPage() {
  const { token } = useParams() as { token: string };
  const [payload, setPayload] = useState<DemoPreviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setNotFound(false);
      try {
        const response = await fetch(`/api/public/demos/${encodeURIComponent(token)}`);
        const data = await response.json().catch(() => null);
        if (!response.ok || !data) {
          if (!cancelled) setNotFound(true);
          return;
        }
        if (!cancelled) setPayload(data as DemoPreviewPayload);
      } catch (err) {
        console.error('Demo preview load error', err);
        if (!cancelled) setNotFound(true);
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
