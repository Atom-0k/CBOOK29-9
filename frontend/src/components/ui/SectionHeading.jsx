export function SectionHeading({ eyebrow, title, action }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-400">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-0.5 text-xl font-bold text-slate-900 dark:text-slate-100 sm:text-2xl">{title}</h1>
      </div>
      {action}
    </div>
  );
}
