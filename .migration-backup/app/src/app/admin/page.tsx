import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/admin/ui/feedback/ErrorBoundary';
import CostsGrid from '@/components/admin/overview/CostsGrid';
import CmPulseSection from '@/components/admin/overview/CmPulseSection';
import KpiGrid from '@/components/admin/overview/KpiGrid';
import AttentionList from '@/components/admin/AttentionList';
import { Skeleton } from '@mantine/core';
import { getAdminActionSession } from '@/app/admin/_actions/shared';
import { PageHeader } from '@/components/admin/ui/layout/PageHeader';
import { 
  loadAdminOverviewCosts, 
  loadOverviewMetricsSection,
  loadOverviewCmPulseSection,
  loadOverviewAttentionSection,
  MetricsSection,
  CmPulseSection as CmPulseSectionData,
  AttentionSection,
  ServiceCostsResult
} from '@/lib/admin/server/overview';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function getStringValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const sortMode =
    getStringValue(params.sort) === 'lowest_activity' ? 'lowest_activity' : 'standard';
  const { user } = await getAdminActionSession('overview.read');

  const attentionPromise = loadOverviewAttentionSection({ sortMode, userId: user.id });
  const metricsPromise = loadOverviewMetricsSection();
  const cmPulsePromise = loadOverviewCmPulseSection({ sortMode });
  const costsPromise = loadAdminOverviewCosts();

  return (
    <div className="space-y-8">
      <PageHeader title="Översikt" subtitle="Operativt tillstånd" />

      <ErrorBoundary fallback={<SectionError title="Uppmärksamhet" />}>
        <Suspense fallback={null}>
          <OverviewTopAttentionSection attentionPromise={attentionPromise} />
        </Suspense>
      </ErrorBoundary>

      <ErrorBoundary fallback={<SectionError title="Nyckeltal" />}>
        <Suspense fallback={<KpiGridFallback />}>
          <OverviewKpiSection metricsPromise={metricsPromise} />
        </Suspense>
      </ErrorBoundary>

      <ErrorBoundary fallback={<SectionError title="CM Puls" />}>
        <Suspense fallback={<CmPulseFallback />}>
          <OverviewCmPulseSection cmPulsePromise={cmPulsePromise} sortMode={sortMode} />
        </Suspense>
      </ErrorBoundary>

      <ErrorBoundary fallback={<SectionError title="Kostnader" />}>
        <Suspense fallback={<CostsGridFallback />}>
          <OverviewCostsSection costsPromise={costsPromise} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

function SectionError({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
      Kunde inte ladda {title.toLowerCase()}. Prova att ladda om sidan.
    </div>
  );
}

async function OverviewKpiSection({
  metricsPromise,
}: {
  metricsPromise: Promise<MetricsSection>;
}) {
  const { metrics } = await metricsPromise;
  return <KpiGrid metrics={metrics} />;
}

async function OverviewCmPulseSection({
  cmPulsePromise,
  sortMode,
}: {
  cmPulsePromise: Promise<CmPulseSectionData>;
  sortMode: 'standard' | 'lowest_activity';
}) {
  const { cmPulse } = await cmPulsePromise;
  return <CmPulseSection rows={cmPulse} sortMode={sortMode} />;
}

async function OverviewTopAttentionSection({
  attentionPromise,
}: {
  attentionPromise: Promise<AttentionSection>;
}) {
  const data = await attentionPromise;
  return (
    <AttentionList
      items={data.attentionItems.slice(0, 3)}
      surface="overview"
    />
  );
}

async function OverviewCostsSection({
  costsPromise,
}: {
  costsPromise: Promise<ServiceCostsResult>;
}) {
  const costs = await costsPromise;
  return <CostsGrid costs={costs} />;
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
