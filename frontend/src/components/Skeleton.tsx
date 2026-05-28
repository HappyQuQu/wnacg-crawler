export function Skeleton({ width, height, borderRadius }: { width?: string; height?: string; borderRadius?: string }) {
  return (
    <span
      className="skeleton"
      style={{ width, height, borderRadius }}
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton-text">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          height="14px"
          width={i === lines - 1 ? "60%" : "100%"}
          borderRadius="4px"
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-card-row">
        <Skeleton width="68px" height="90px" borderRadius="8px" />
        <div className="skeleton-card-body">
          <Skeleton height="14px" width="40%" borderRadius="4px" />
          <Skeleton height="16px" width="80%" borderRadius="4px" />
          <Skeleton height="6px" width="100%" borderRadius="999px" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="skeleton-table">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="skeleton-table-row">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} height="14px" width={c === 0 ? "60%" : "80%"} borderRadius="4px" />
          ))}
        </div>
      ))}
    </div>
  );
}
