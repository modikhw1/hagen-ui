export function DemoBoardSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-5">
      {Array.from({ length: 5 }, (_, columnIndex) => (
        <section
          key={columnIndex}
          className="rounded-xl border border-border bg-card p-4"
          aria-hidden
        >
          <div className="mb-3 h-4 w-24 animate-pulse rounded bg-secondary" />
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, cardIndex) => (
              <div
                key={cardIndex}
                className="rounded-lg border border-border bg-secondary/30 p-3"
              >
                <div className="h-3 w-2/3 animate-pulse rounded bg-secondary" />
                <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-secondary" />
                <div className="mt-3 h-8 w-full animate-pulse rounded bg-secondary" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
