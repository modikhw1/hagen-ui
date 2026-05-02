export function AdminSkeletonRow({ height = 44 }: { height?: number }) {
  return (
    <div
      className="motion-reduce:animate-none animate-pulse rounded-md bg-secondary/60"
      style={{ height }}
    />
  );
}

export function AdminSkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-5">
      <div className="h-4 w-1/3 rounded bg-secondary motion-reduce:animate-none animate-pulse" />
      {Array.from({ length: lines }, (_, index) => (
        <div
          // Fixed key from stable, deterministic line count.
          key={`line-${index}`}
          className="h-3 w-full rounded bg-secondary/60 motion-reduce:animate-none animate-pulse"
        />
      ))}
    </div>
  );
}

