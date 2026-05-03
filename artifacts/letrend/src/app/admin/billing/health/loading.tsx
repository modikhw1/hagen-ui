import { Skeleton } from '@mantine/core';

export default function BillingHealthLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton h={16} w={64} />
        <Skeleton h={28} w={96} radius="xl" />
        <Skeleton ml="auto" h={40} w={144} radius="md" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} h={96} w="100%" radius="lg" />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Skeleton h={288} w="100%" radius="lg" />
        <Skeleton h={288} w="100%" radius="lg" />
      </div>
    </div>
  );
}
