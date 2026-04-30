export function Skeleton({
  className = "",
  width,
  height = "1rem",
}: {
  className?: string;
  width?: string | number;
  height?: string | number;
}) {
  return (
    <div
      className={`animate-pulse rounded bg-edge/60 ${className}`}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
      }}
    />
  );
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="bg-panel border border-edge rounded-lg p-5 space-y-3">
      <Skeleton width="35%" height={12} />
      <Skeleton width="70%" height={28} />
      {Array.from({ length: rows - 1 }).map((_, i) => (
        <Skeleton key={i} width={i === rows - 2 ? "60%" : "90%"} height={12} />
      ))}
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 py-3 border-t border-edge">
      <Skeleton width={32} height={12} />
      <div className="flex-1 space-y-2">
        <Skeleton width="80%" height={14} />
        <Skeleton width="40%" height={10} />
      </div>
      <Skeleton width={64} height={20} className="rounded-full" />
      <Skeleton width={48} height={12} />
    </div>
  );
}
