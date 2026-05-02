export default function TeamMemberCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-secondary/60" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 rounded bg-secondary/60" />
            <div className="h-3 w-28 rounded bg-secondary/40" />
          </div>
        </div>
        <div className="grid min-w-[320px] grid-cols-3 gap-4">
          <div className="h-10 rounded bg-secondary/40" />
          <div className="h-10 rounded bg-secondary/40" />
          <div className="h-10 rounded bg-secondary/40" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-10 rounded bg-secondary/30" />
        <div className="h-10 rounded bg-secondary/30" />
        <div className="h-10 rounded bg-secondary/30" />
      </div>
    </div>
  );
}
