import { Skeleton } from '@mantine/core';

export default function CustomerBillingLoading() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.65fr_1fr]">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Skeleton h={16} w={128} />
          <Skeleton h={32} w={96} radius="xl" />
        </div>
        <div className="space-y-3">
          <Skeleton h={80} w="100%" radius="md" />
          <Skeleton h={80} w="100%" radius="md" />
          <Skeleton h={80} w="100%" radius="md" />
        </div>
      </div>
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-5">
          <Skeleton mb={16} h={16} w={144} />
          <Skeleton h={112} w="100%" radius="md" />
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <Skeleton mb={16} h={16} w={128} />
          <Skeleton h={40} w="100%" radius="md" />
        </div>
      </div>
    </div>
  );
}
