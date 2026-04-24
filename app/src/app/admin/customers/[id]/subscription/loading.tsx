import { Skeleton } from '@/components/ui/skeleton';

export default function SubscriptionLoading() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-5">
          <Skeleton className="mb-4 h-4 w-36" />
          <div className="space-y-3">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <Skeleton className="mb-4 h-4 w-28" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
