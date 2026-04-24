import { Suspense } from 'react';
import CostsGrid from '@/components/admin/overview/CostsGrid';
import CmPulseSection from '@/components/admin/overview/CmPulseSection';
import KpiGrid from '@/components/admin/overview/KpiGrid';
import AttentionList from '@/components/admin/AttentionList';
import { Skeleton } from '@/components/ui/skeleton';
import { getAdminActionSession } from '@/app/admin/_actions/shared';
import { PageHeader } from '@/components/admin/ui/layout/PageHeader';
import { loadAdminOverview } from '@/lib/admin/server/overview';

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

  const overviewPromise = loadAdminOverview({ sortMode, userId: user.id });

  return (
    <div className="space-y-8">
      <PageHeader title="Översikt" subtitle="Operativt tillstånd" />

      <Suspense fallback={null}>
        <OverviewTopAttentionSection overviewPromise={overviewPromise} />
      </Suspense>

      <Suspense fallback={<KpiGridFallback />}>
        <OverviewKpiSection overviewPromise={overviewPromise} />
      </Suspense>

      <Suspense fallback={<CmPulseFallback />}>
        <OverviewCmPulseSection overviewPromise={overviewPromise} sortMode={sortMode} />
      </Suspense>

      <Suspense fallback={<CostsGridFallback />}>
        <OverviewCostsSection overviewPromise={overviewPromise} />
      </Suspense>
    </div>
  );
}

async function OverviewKpiSection({
  overviewPromise,
}: {
  overviewPromise: Promise<Awaited<ReturnType<typeof loadAdminOverview>>>;
}) {
  const data = await overviewPromise;
  return <KpiGrid metrics={data.metrics} />;
}

async function OverviewCmPulseSection({
  overviewPromise,
  sortMode,
}: {
  overviewPromise: Promise<Awaited<ReturnType<typeof loadAdminOverview>>>;
  sortMode: 'standard' | 'lowest_activity';
}) {
  const data = await overviewPromise;
  return <CmPulseSection rows={data.cmPulse} sortMode={sortMode} />;
}

async function OverviewTopAttentionSection({
  overviewPromise,
}: {
  overviewPromise: Promise<Awaited<ReturnType<typeof loadAdminOverview>>>;
}) {
  const data = await overviewPromise;
  return (
    <AttentionList
      items={data.attentionItems}
      surface="overview"
    />
  );
}

async function OverviewCostsSection({
  overviewPromise,
}: {
  overviewPromise: Promise<Awaited<ReturnType<typeof loadAdminOverview>>>;
}) {
  const data = await overviewPromise;
  return <CostsGrid costs={data.costs} />;
}

function KpiGridFallback() {
  return (
    <section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    </section>
  );
}

function CmPulseFallback() {
  return <Skeleton className="h-64 w-full rounded-lg" />;
}

function CostsGridFallback() {
  return <Skeleton className="h-48 w-full rounded-lg" />;
}
