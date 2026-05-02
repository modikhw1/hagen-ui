import { Skeleton } from '@mantine/core';

export default function BillingSubscriptionsLoading() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} h={96} w="100%" radius="lg" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} h={56} w="100%" radius="lg" />
        ))}
      </div>
    </div>
  );
}
