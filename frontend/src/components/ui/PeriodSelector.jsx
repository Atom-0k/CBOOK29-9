import { useEffect, useRef, useState } from "react";
import { CalendarRange, Check, ChevronDown } from "lucide-react";

export function PeriodSelector({ value, onChange, periodos, label = "Período", className = "" }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);
  const seleccionado = periodos.find((p) => p.clave === value) || periodos[0];

  useEffect(() => {
    function onClickAfuera(e) {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", onClickAfuera);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickAfuera);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-all duration-200 hover:border-cyan-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-700"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-800 to-teal-600 text-white shadow-sm">
            <CalendarRange className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {label}
            </span>
            <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">
              {seleccionado?.titulo || "Elegí un período"}
            </span>
            {seleccionado?.descripcion && (
              <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                {seleccionado.descripcion}
              </span>
            )}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {seleccionado?.pendientes > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-600/10 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/20">
              {seleccionado.pendientes} por firmar
            </span>
          )}
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-transform duration-200 dark:bg-slate-800 dark:text-slate-400 ${
              abierto ? "rotate-180" : ""
            }`}
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </span>
        </span>
      </button>

      {abierto && (
        <div
          role="listbox"
          className="menu-pop absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-800 dark:ring-white/5"
        >
          {periodos.map((p) => {
            const activo = p.clave === value;
            return (
              <button
                key={p.clave}
                type="button"
                role="option"
                aria-selected={activo}
                onClick={() => {
                  onChange(p.clave);
                  setAbierto(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors duration-150 ${
                  activo
                    ? "bg-cyan-50 ring-1 ring-inset ring-cyan-600/10 dark:bg-cyan-500/10 dark:ring-cyan-400/20"
                    : "hover:bg-slate-50 dark:hover:bg-slate-700/60"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-extrabold uppercase tracking-wide ${
                    activo
                      ? "bg-gradient-to-br from-cyan-800 to-teal-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300"
                  }`}
                >
                  {p.corto || p.clave}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-sm font-semibold ${
                      activo ? "text-cyan-800 dark:text-cyan-300" : "text-slate-900 dark:text-slate-100"
                    }`}
                  >
                    {p.titulo}
                  </span>
                  {p.descripcion && (
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                      {p.descripcion}
                    </span>
                  )}
                </span>
                {p.pendientes > 0 && !activo && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                    {p.pendientes}
                  </span>
                )}
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    activo ? "bg-cyan-700 text-white dark:bg-cyan-500" : "text-transparent"
                  }`}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
