import { Skeleton } from '@mantine/core';

export default function SubscriptionLoading() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton h={96} w="100%" radius="lg" />
          <Skeleton h={96} w="100%" radius="lg" />
        </div>
        <Skeleton h={96} w="100%" radius="lg" />
      </div>
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-5">
          <Skeleton mb={16} h={16} w={144} />
          <div className="space-y-3">
            <Skeleton h={40} w="100%" radius="md" />
            <Skeleton h={40} w="100%" radius="md" />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <Skeleton mb={16} h={16} w={112} />
          <Skeleton h={96} w="100%" radius="lg" />
        </div>
      </div>
    </div>
  );
}
