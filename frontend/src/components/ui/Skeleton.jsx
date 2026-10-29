export function Skeleton({ className = "" }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-200/80 dark:bg-slate-700/60 ${className}`}
      aria-hidden="true"
    />
  );
}
