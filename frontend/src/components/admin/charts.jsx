export function StackedBars({ data, height = 170, colores = { confirmadas: "bg-emerald-500", pendientes: "bg-amber-400", otras: "bg-slate-300 dark:bg-slate-600" } }) {
  const max = Math.max(1, ...data.map((d) => d.total || d.valor || 0));
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((d, i) => {
        const total = d.total || d.valor || 0;
        return (
          <div key={i} className="flex h-full flex-1 flex-col items-center">
            <div className="flex w-full flex-1 items-end">
              <div
                className="flex w-full flex-col-reverse overflow-hidden rounded-t"
                style={{ height: `${(total / max) * 100}%`, minHeight: total ? 2 : 0 }}
                title={d.titulo}
              >
                {d.confirmadas ? (
                  <>
                    {d.pendientes > 0 && (
                      <div
                        className={`w-full ${colores.pendientes}`}
                        style={{ height: `${(d.pendientes / total) * 100}%` }}
                      />
                    )}
                    {d.confirmadas > 0 && (
                      <div
                        className={`w-full ${colores.confirmadas}`}
                        style={{ height: `${(d.confirmadas / total) * 100}%` }}
                      />
                    )}
                  </>
                ) : (
                  <div className={`w-full ${colores.otras}`} style={{ height: "100%" }} />
                )}
              </div>
            </div>
            <span className="mt-1.5 whitespace-nowrap text-[10px] text-slate-400 dark:text-slate-500">
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function Donut({ data, size = 130, grosor = 18, centerLabel }) {
  const total = Math.max(1, data.reduce((s, d) => s + d.valor, 0));
  const r = (size - grosor) / 2;
  const c = 2 * Math.PI * r;
  const colores = ["#0f766e", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#f43f5e", "#94a3b8"];
  let acum = 0;
  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={grosor} className="stroke-slate-100 dark:stroke-slate-800" />
          {data.map((d, i) => {
            const frac = d.valor / total;
            const inicio = acum * c;
            acum += frac;
            if (!d.valor) return null;
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={colores[i % colores.length]}
                strokeWidth={grosor}
                strokeDasharray={`${frac * c} ${c}`}
                strokeDashoffset={-inicio}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{centerLabel ?? total}</p>
        </div>
      </div>
      <div className="space-y-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colores[i % colores.length] }} />
            <span className="capitalize text-slate-600 dark:text-slate-300">{d.label}</span>
            <span className="ml-auto font-semibold text-slate-800 dark:text-slate-100">{d.valor}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GraficaCard({ title, sub, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
      {sub && <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{sub}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}
