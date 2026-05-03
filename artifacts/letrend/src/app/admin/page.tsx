import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/admin/ui/feedback/ErrorBoundary';
import CostsGrid from '@/components/admin/overview/CostsGrid';
import CmPulseSection from '@/components/admin/overview/CmPulseSection';
import KpiGrid from '@/components/admin/overview/KpiGrid';
import AttentionList from '@/components/admin/AttentionList';
import { Skeleton } from '@mantine/core';
import { PageHeader } from '@/components/admin/ui/layout/PageHeader';
import { useSearchParams } from '@/lib/navigation-compat';
import { useAdminOverview } from '@/hooks/admin/useAdminOverview';

function SectionError({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
      Kunde inte ladda {title.toLowerCase()}. Prova att ladda om sidan.
    </div>
  );
}

function KpiGridFallback() {
  return (
    <section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} h={96} w="100%" radius="lg" />
        ))}
      </div>
    </section>
  );
}

function CmPulseFallback() {
  return <Skeleton h={256} w="100%" radius="lg" />;
}

function CostsGridFallback() {
  return <Skeleton h={192} w="100%" radius="lg" />;
}

export default function AdminOverviewPage() {
  const [searchParams] = useSearchParams();
  const sortMode = searchParams.get('sort') === 'lowest_activity' ? 'lowest_activity' : 'standard';
  const { data, isLoading } = useAdminOverview(sortMode);

  return (
    <div className="space-y-8">
      <PageHeader title="Översikt" subtitle="Operativt tillstånd" />

      <ErrorBoundary fallback={<SectionError title="Uppmärksamhet" />}>
        <Suspense fallback={null}>
          {isLoading || !data ? null : (
            <AttentionList items={data.attentionItems.slice(0, 3)} surface="overview" />
          )}
        </Suspense>
      </ErrorBoundary>

      <ErrorBoundary fallback={<SectionError title="Nyckeltal" />}>
        <Suspense fallback={<KpiGridFallback />}>
          {isLoading || !data ? <KpiGridFallback /> : <KpiGrid metrics={data.metrics} />}
        </Suspense>
      </ErrorBoundary>

      <ErrorBoundary fallback={<SectionError title="CM Puls" />}>
        <Suspense fallback={<CmPulseFallback />}>
          {isLoading || !data ? <CmPulseFallback /> : <CmPulseSection rows={data.cmPulse} sortMode={sortMode} />}
        </Suspense>
      </ErrorBoundary>

      <ErrorBoundary fallback={<SectionError title="Kostnader" />}>
        <Suspense fallback={<CostsGridFallback />}>
          {isLoading || !data ? <CostsGridFallback /> : <CostsGrid costs={data.costs} />}
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
