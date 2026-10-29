import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, Users, Check } from "lucide-react";

/**
 * Casilla de selección con estado "indeterminado" (una parte marcada).
 * El atributo `indeterminate` no se puede poner desde JSX, hay que hacerlo
 * por referencia: por eso es un componente y no un <input> suelto.
 */
function Casilla({ marcada, indeterminado = false, onChange, label, descripcion, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminado) && !marcada;
  }, [indeterminado, marcada]);
  return (
    <label className={`flex items-start gap-2.5 ${className}`}>
      <input
        ref={ref}
        type="checkbox"
        checked={marcada}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-cyan-700 focus:ring-cyan-600 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{label}</span>
        {descripcion && (
          <span className="block text-xs text-slate-400 dark:text-slate-500">{descripcion}</span>
        )}
      </span>
    </label>
  );
}

/** Nombre corto de una lista, para el resumen: "Ana, Belén y 3 más". */
function resumenNombres(nombres, maximo = 3) {
  if (nombres.length <= maximo) {
    if (nombres.length === 1) return nombres[0];
    return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
  }
  return `${nombres.slice(0, maximo).join(", ")} y ${nombres.length - maximo} más`;
}

/**
 * Selección de a quién se le manda la nota.
 *
 * Antes era un <select> con "todo el curso" o un alumno, así que para
 * avisarle a tres había que escribir la nota tres veces. Acá se marca cada
 * alumno con una casilla y el texto se escribe una sola vez.
 *
 * `seleccion` es un array de gmail (después de limpiar duplicados) y `onCambiar`
 * recibe el array nuevo.
 */
export function SelectorDestinatarios({
  alumnos,
  cargando,
  error,
  seleccion,
  onCambiar,
}) {
  const [filtro, setFiltro] = useState("");

  const todos = alumnos.map((a) => a.gmail);
  const marcados = new Set(seleccion);
  const completos = todos.length > 0 && todos.every((g) => marcados.has(g));
  const parciales = !completos && todos.some((g) => marcados.has(g));

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return alumnos;
    return alumnos.filter(
      (a) => a.nombre.toLowerCase().includes(q) || a.gmail.toLowerCase().includes(q),
    );
  }, [alumnos, filtro]);

  if (cargando) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2.5 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando alumnos...
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
        {error}
      </p>
    );
  }

  if (alumnos.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 px-3 py-2.5 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
        No se encontraron alumnos para este curso.
      </p>
    );
  }

  function alternar(gmail) {
    const siguiente = new Set(seleccion);
    if (siguiente.has(gmail)) siguiente.delete(gmail);
    else siguiente.add(gmail);
    onCambiar([...siguiente]);
  }

  function marcarTodos(marcar) {
    onCambiar(marcar ? todos : []);
  }

  const nombresSeleccionados = alumnos
    .filter((a) => marcados.has(a.gmail))
    .map((a) => a.nombre);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
      {/* Cabecera: el interruptor de "todos" y el contador */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
        <Casilla
          marcada={completos}
          indeterminado={parciales}
          onChange={marcarTodos}
          label={`Todo el curso (${alumnos.length})`}
        />
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">
          {seleccion.length} de {alumnos.length}
        </span>
      </div>

      {/* Buscador: con cursos grandes la lista es larga */}
      {alumnos.length > 6 && (
        <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="text"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar alumno por nombre o correo"
              className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-cyan-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>
      )}

      {/* Lista */}
      <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
        {visibles.map((a) => {
          const marcado = marcados.has(a.gmail);
          return (
            <li key={a.gmail}>
              <label
                className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 transition-colors duration-150 ${
                  marcado ? "bg-cyan-50/60 dark:bg-cyan-500/10" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => alternar(a.gmail)}
                  className="h-4 w-4 shrink-0 rounded border-slate-300 text-cyan-700 focus:ring-cyan-600 dark:border-slate-600 dark:bg-slate-800"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {a.nombre}
                  </span>
                  <span className="block truncate text-xs text-slate-400 dark:text-slate-500">
                    {a.gmail}
                  </span>
                </span>
                {marcado && <Check className="h-3.5 w-3.5 shrink-0 text-cyan-600" aria-hidden="true" />}
              </label>
            </li>
          );
        })}
        {visibles.length === 0 && (
          <li className="px-3 py-4 text-center text-xs text-slate-400 dark:text-slate-500">
            Ningún alumno coincide con “{filtro}”.
          </li>
        )}
      </ul>

      {/* Pie: qué va a pasar realmente */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/60">
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {seleccion.length === 0
              ? "Elegí al menos un alumno"
              : completos
                ? `Se enviará a todo el curso (${alumnos.length} alumnos)`
                : `Se enviará a ${resumenNombres(nombresSeleccionados)}`}
          </span>
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => marcarTodos(true)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 transition-colors duration-200 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            disabled={completos}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => marcarTodos(false)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 transition-colors duration-200 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            disabled={seleccion.length === 0}
          >
            Ninguno
          </button>
        </div>
      </div>
    </div>
  );
}
