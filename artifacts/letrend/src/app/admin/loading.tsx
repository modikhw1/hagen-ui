import { Skeleton } from '@mantine/core';

export default function AdminOverviewLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton h={32} w={144} />
        <Skeleton h={16} w={160} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} h={96} w="100%" radius="lg" />
        ))}
      </div>

      <Skeleton h={256} w="100%" radius="lg" />
      <Skeleton h={192} w="100%" radius="lg" />
      <Skeleton h={192} w="100%" radius="lg" />
    </div>
  );
}
