import { useState, useRef, useEffect } from "react";
import { ChevronDown, ClipboardCheck, Loader2, Lock, PenLine, X } from "lucide-react";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { CURRENT_USER, MATERIAS_MOCK, CONECTADO_A_DJANGO, getCalificacionesMateria } from "../../data/mock";
import { getCsrfToken } from "../../utils/csrf";

const CUATRIMESTRES = [
  { clave: "1", titulo: "1° Cuatrimestre" },
  { clave: "2", titulo: "2° Cuatrimestre" },
];

function planillaVacia() {
  const fila = () => ({ fila: 0, fecha: "", detalle: "", firmaDocente: "", firmaPadre: "" });
  return {
    cuatrimestres: {
      "1": { filas: Array.from({ length: 7 }, (_, i) => ({ ...fila(), fila: i + 1 })), notaFinal: "" },
      "2": { filas: Array.from({ length: 7 }, (_, i) => ({ ...fila(), fila: i + 1 })), notaFinal: "" },
    },
  };
}

function formatFechaCorta(iso) {
  if (!iso) return "--";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function FirmaPadreCelda({ materia, cursoInfo, cuatrimestre, fila, firmaPadre, puedeFirmar, onFirmado }) {
  const [abierto, setAbierto] = useState(false);
  const [pin, setPin] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  async function confirmar() {
    if (!pin.trim()) {
      setError("Ingresá el PIN del responsable.");
      return;
    }
    if (!CONECTADO_A_DJANGO) {
      onFirmado(cuatrimestre, fila, new Date().toISOString().slice(0, 10));
      setAbierto(false);
      setPin("");
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const resp = await fetch("/api/calificaciones/firmar/", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
        body: JSON.stringify({
          curso: cursoInfo.curso,
          materia: materia.nombre,
          cuatrimestre: Number(cuatrimestre),
          fila,
          pin,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "No se pudo firmar.");
      onFirmado(cuatrimestre, fila, data.firmaPadre);
      setAbierto(false);
      setPin("");
    } catch (err) {
      setError(err.message || "Ocurrió un error al firmar.");
    } finally {
      setCargando(false);
    }
  }

  if (firmaPadre) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
        <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
        Firmado {formatFechaCorta(firmaPadre)}
      </span>
    );
  }

  if (!puedeFirmar) {
    return <span className="text-xs text-slate-400 dark:text-slate-500">Sin nota cargada</span>;
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {!abierto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 transition-colors duration-200 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          Firmar con PIN
        </button>
      ) : (
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1">
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmar();
              }}
              placeholder="PIN"
              className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-center text-xs text-slate-900 focus:border-cyan-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={confirmar}
              disabled={cargando}
              className="inline-flex items-center gap-1 rounded-md bg-cyan-800 px-2 py-1 text-xs font-semibold text-white transition-colors duration-200 hover:bg-cyan-900 disabled:opacity-60 dark:bg-cyan-600 dark:hover:bg-cyan-500"
            >
              {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : "OK"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAbierto(false);
                setPin("");
                setError(null);
              }}
              disabled={cargando}
              className="inline-flex items-center rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 transition-colors duration-200 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          {error && <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
      )}
    </div>
  );
}

function TablaCuatrimestre({ titulo, cuatrimestre, datos, materia, cursoInfo, onFirmado }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="bg-cyan-800 px-4 py-2.5 dark:bg-cyan-700">
        <h3 className="text-sm font-semibold text-white">{titulo}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="w-24 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Fecha
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Detalle
              </th>
              <th className="w-36 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Firma docente
              </th>
              <th className="w-40 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Firma padre (PIN)
              </th>
            </tr>
          </thead>
          <tbody>
            {datos.filas.map((fila) => (
              <tr key={fila.fila} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                <td className="whitespace-nowrap px-2 py-2.5 text-center text-slate-500 dark:text-slate-400">
                  {formatFechaCorta(fila.fecha)}
                </td>
                <td className="px-4 py-2.5 text-slate-900 dark:text-slate-100">{fila.detalle || ""}</td>
                <td className="whitespace-nowrap px-2 py-2.5 text-center text-xs text-slate-500 dark:text-slate-400">
                  {fila.firmaDocente || ""}
                </td>
                <td className="px-2 py-2.5 text-center">
                  {cursoInfo ? (
                    <FirmaPadreCelda
                      materia={materia}
                      cursoInfo={cursoInfo}
                      cuatrimestre={cuatrimestre}
                      fila={fila.fila}
                      firmaPadre={fila.firmaPadre}
                      puedeFirmar={Boolean(fila.fecha && fila.detalle && fila.firmaDocente)}
                      onFirmado={onFirmado}
                    />
                  ) : (
                    <span className="text-xs text-slate-400 dark:text-slate-500">--</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Calificación final
        </span>
        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{datos.notaFinal || "--"}</span>
      </div>
    </div>
  );
}

function SelectorMateria({ materias, seleccionada, onCambiar, deshabilitado }) {
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
    <div className="relative mb-5" ref={ref}>
      <button
        onClick={() => setAbierto((a) => !a)}
        aria-haspopup="listbox"
        disabled={deshabilitado}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-colors duration-200 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800 sm:w-auto sm:min-w-[280px]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ClipboardCheck className="h-4 w-4 shrink-0 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
          <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {seleccionada?.nombre || "Elegí una materia"}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${abierto ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {abierto && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800 sm:right-auto sm:w-80"
        >
          {materias.map((m) => (
            <li key={m.id ?? m.nombre}>
              <button
                role="option"
                onClick={() => {
                  onCambiar(m);
                  setAbierto(false);
                }}
                className={`flex w-full flex-col px-4 py-2.5 text-left transition-colors duration-200 ${
                  seleccionada?.nombre === m.nombre
                    ? "bg-cyan-50 dark:bg-cyan-500/10"
                    : "hover:bg-slate-50 dark:hover:bg-slate-700/60"
                }`}
              >
                <span
                  className={`text-sm font-medium ${
                    seleccionada?.nombre === m.nombre ? "text-cyan-800 dark:text-cyan-400" : "text-slate-900 dark:text-slate-100"
                  }`}
                >
                  {m.nombre}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">{m.profesor}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CalificacionesView() {
  const cursoCodigo = CURRENT_USER.cursoCodigo || "";
  const alumnoGmail = CURRENT_USER.gmail || "";

  const [materias, setMaterias] = useState(CONECTADO_A_DJANGO ? [] : MATERIAS_MOCK);
  const [cargandoMaterias, setCargandoMaterias] = useState(false);
  const [materiaSeleccionada, setMateriaSeleccionada] = useState(CONECTADO_A_DJANGO ? null : MATERIAS_MOCK[0] || null);
  const [calif, setCalif] = useState(planillaVacia());
  const [cargandoCalif, setCargandoCalif] = useState(false);

  useEffect(() => {
    if (!CONECTADO_A_DJANGO) return;
    if (!cursoCodigo) return;
    setCargandoMaterias(true);
    fetch(`/api/materias-por-curso/?curso=${encodeURIComponent(cursoCodigo)}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => setMaterias(data.materias || []))
      .catch(() => setMaterias([]))
      .finally(() => setCargandoMaterias(false));
  }, [cursoCodigo]);

  useEffect(() => {
    if (!materiaSeleccionada) {
      setCalif(planillaVacia());
      return;
    }
    if (!CONECTADO_A_DJANGO) {
      const mock = getCalificacionesMateria(materiaSeleccionada.nombre);
      setCalif(mock);
      return;
    }
    if (!cursoCodigo || !alumnoGmail) return;
    setCargandoCalif(true);
    const params = new URLSearchParams({
      curso: cursoCodigo,
      materia: materiaSeleccionada.nombre,
      alumno: alumnoGmail,
    });
    fetch(`/api/calificaciones/?${params}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => setCalif(data.cuatrimestres ? { cuatrimestres: data.cuatrimestres } : planillaVacia()))
      .catch(() => setCalif(planillaVacia()))
      .finally(() => setCargandoCalif(false));
  }, [materiaSeleccionada, cursoCodigo, alumnoGmail]); // eslint-disable-line react-hooks/exhaustive-deps

  function alFirmarFila(cuatrimestre, fila, firmaPadre) {
    setCalif((prev) => ({
      ...prev,
      cuatrimestres: {
        ...prev.cuatrimestres,
        [cuatrimestre]: {
          ...prev.cuatrimestres[cuatrimestre],
          filas: prev.cuatrimestres[cuatrimestre].filas.map((f) =>
            f.fila === fila ? { ...f, firmaPadre } : f,
          ),
        },
      },
    }));
  }

  const cursoInfo = { curso: cursoCodigo };

  return (
    <div>
      <SectionHeading eyebrow={CURRENT_USER.curso} title="Mis Calificaciones" />
      <SelectorMateria
        materias={materias}
        seleccionada={materiaSeleccionada}
        onCambiar={setMateriaSeleccionada}
        deshabilitado={cargandoMaterias}
      />
      {cargandoMaterias ? (
        <Skeleton className="h-10 w-full rounded-xl" />
      ) : materias.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="Todavía no tenés materias cargadas para tu curso" />
      ) : !materiaSeleccionada ? (
        <EmptyState icon={ClipboardCheck} title="Elegí una materia para ver tus calificaciones" />
      ) : cargandoCalif ? (
        <div className="space-y-4">
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-4">
          {CUATRIMESTRES.map(({ clave, titulo }) => (
            <TablaCuatrimestre
              key={clave}
              titulo={titulo}
              cuatrimestre={clave}
              datos={calif.cuatrimestres[clave]}
              materia={materiaSeleccionada}
              cursoInfo={cursoInfo}
              onFirmado={alFirmarFila}
            />
          ))}
        </div>
      )}
    </div>
  );
}
