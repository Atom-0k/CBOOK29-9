import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Dropdown genérico compartido (curso, materia, turno, alumno...).
 * - En celular ocupa el ancho disponible; en pantallas medianas+ se abre como lista fija.
 * - `opciones`: [{ key, titulo, subtitulo? }].
 */
export function Selector({ label, opciones, valorTexto, onCambiar, deshabilitado = false, className = "" }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickAfuera(e) {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    }
    document.addEventListener("mousedown", onClickAfuera);
    return () => document.removeEventListener("mousedown", onClickAfuera);
  }, []);

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        disabled={deshabilitado}
        onClick={() => setAbierto((a) => !a)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-colors duration-200 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800 sm:min-w-[280px]"
      >
        <span className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {label}
          </span>
          <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {valorTexto || "Elegí una opción"}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${abierto ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {abierto && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800 sm:right-auto sm:w-80">
          {opciones.map((op) => (
            <li key={op.key}>
              <button
                type="button"
                onClick={() => {
                  onCambiar(op.key);
                  setAbierto(false);
                }}
                className="flex w-full flex-col px-4 py-2.5 text-left transition-colors duration-200 hover:bg-slate-50 dark:hover:bg-slate-700/60"
              >
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{op.titulo}</span>
                {op.subtitulo && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">{op.subtitulo}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
