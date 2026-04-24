import { Skeleton } from '@/components/ui/skeleton';

export default function CustomerBillingLoading() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.65fr_1fr]">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      </div>
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-5">
          <Skeleton className="mb-4 h-4 w-36" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <Skeleton className="mb-4 h-4 w-32" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}
