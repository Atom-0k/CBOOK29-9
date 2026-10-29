import { useState, useRef, useEffect } from "react";
import {
  BadgeCheck,
  BookOpen,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Loader2,
  Lock,
  PenLine,
  ShieldCheck,
  X,
} from "lucide-react";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { PeriodSelector } from "../../components/ui/PeriodSelector";
import { CURRENT_USER, MATERIAS_MOCK, CONECTADO_A_DJANGO, getCalificacionesMateria } from "../../data/mock";
import { getCsrfToken } from "../../utils/csrf";

const PERIODOS = [
  { clave: "1", titulo: "1° Cuatrimestre", corto: "1°C" },
  { clave: "2", titulo: "2° Cuatrimestre", corto: "2°C" },
  { clave: "3", titulo: "Diciembre", corto: "DIC" },
  { clave: "4", titulo: "Febrero", corto: "FEB" },
  { clave: "5", titulo: "Marzo", corto: "MAR" },
];

const TONOS = {
  cyan: {
    icono: "bg-cyan-50 text-cyan-700 ring-cyan-600/10 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-400/20",
    valor: "text-slate-900 dark:text-slate-100",
  },
  amber: {
    icono: "bg-amber-50 text-amber-600 ring-amber-500/10 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
    valor: "text-amber-700 dark:text-amber-300",
  },
  emerald: {
    icono: "bg-emerald-50 text-emerald-600 ring-emerald-500/10 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
    valor: "text-emerald-700 dark:text-emerald-300",
  },
};

function periodoVacio() {
  const fila = (i) => ({ fila: i, fecha: "", detalle: "", firmaDocente: "", firmaPadre: "" });
  return { filas: Array.from({ length: 7 }, (_, i) => fila(i + 1)), notaFinal: "" };
}

function planillaVacia() {
  return {
    cuatrimestres: Object.fromEntries(PERIODOS.map(({ clave }) => [clave, periodoVacio()])),
  };
}

function formatFechaCorta(iso) {
  if (!iso) return "--";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function StatResumen({ icon: Icon, label, value, tono }) {
  const t = TONOS[tono];
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${t.icono}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <p className={`text-xl font-bold leading-tight ${t.valor}`}>{value}</p>
      </div>
    </div>
  );
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
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        {formatFechaCorta(firmaPadre)}
      </span>
    );
  }

  if (!puedeFirmar) {
    return (
      <span className="text-xs text-slate-400 dark:text-slate-500" title="La nota todavía no fue cargada por el docente">
        —
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {!abierto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 transition-colors duration-200 hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
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
              aria-label="PIN del responsable"
              className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-xs text-slate-900 focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-600/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={confirmar}
              disabled={cargando}
              className="inline-flex items-center gap-1 rounded-lg bg-cyan-800 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors duration-200 hover:bg-cyan-900 disabled:opacity-60 dark:bg-cyan-600 dark:hover:bg-cyan-500"
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
              aria-label="Cancelar firma"
              className="inline-flex items-center rounded-lg border border-slate-300 px-2 py-1.5 text-slate-600 transition-colors duration-200 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          {error && <p className="max-w-[190px] text-[11px] font-medium text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
      )}
    </div>
  );
}

function TablaCuatrimestre({ titulo, cuatrimestre, datos, materia, cursoInfo, onFirmado }) {
  const filas = datos?.filas || [];
  const registros = filas.filter((f) => f.fecha && f.detalle).length;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-cyan-900 to-teal-800 px-4 py-3 dark:from-cyan-800 dark:to-teal-700">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
            <CalendarRange className="h-4 w-4 text-cyan-50" aria-hidden="true" />
          </span>
          <h3 className="text-sm font-semibold text-white">{titulo}</h3>
        </div>
        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-50">
          {registros} {registros === 1 ? "registro" : "registros"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/40">
              <th className="w-28 px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Fecha
              </th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Detalle
              </th>
              <th className="w-36 px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Firma docente
              </th>
              <th className="w-44 px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Firma del responsable
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => {
              const cargada = Boolean(fila.fecha && fila.detalle);
              return (
                <tr
                  key={fila.fila}
                  className={`border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/70 dark:border-slate-800/60 dark:hover:bg-slate-800/40 ${
                    cargada ? "" : "opacity-60"
                  }`}
                >
                  <td className="whitespace-nowrap px-3 py-3 text-center">
                    {fila.fecha ? (
                      <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {formatFechaCorta(fila.fecha)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300 dark:text-slate-600">--</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {fila.detalle ? (
                      <span className="font-medium text-slate-900 dark:text-slate-100">{fila.detalle}</span>
                    ) : (
                      <span className="text-xs italic text-slate-400 dark:text-slate-500">Sin registrar</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-center text-xs text-slate-500 dark:text-slate-400">
                    {fila.firmaDocente ? (
                      <span className="inline-flex items-center gap-1.5">
                        <PenLine className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" aria-hidden="true" />
                        {fila.firmaDocente}
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
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
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-gradient-to-r from-slate-50 to-cyan-50/50 px-4 py-3 dark:border-slate-800 dark:from-slate-800/60 dark:to-cyan-500/5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Calificación final
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">Definida por el docente</p>
        </div>
        <span
          className={`flex h-11 min-w-[3rem] items-center justify-center rounded-xl px-3 text-lg font-extrabold ${
            datos?.notaFinal
              ? "bg-cyan-800 text-white shadow-sm dark:bg-cyan-600"
              : "border border-dashed border-slate-300 bg-white text-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-500"
          }`}
        >
          {datos?.notaFinal || "—"}
        </span>
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
    <div className="relative mb-4" ref={ref}>
      <button
        onClick={() => setAbierto((a) => !a)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        disabled={deshabilitado}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-colors duration-200 hover:border-cyan-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-700 dark:hover:bg-slate-800"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 ring-1 ring-cyan-600/10 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-400/20">
            <BookOpen className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Materia
            </span>
            <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {seleccionada?.nombre || "Elegí una materia"}
            </span>
            {seleccionada?.profesor && (
              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{seleccionada.profesor}</span>
            )}
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
          className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
        >
          {materias.map((m) => {
            const activa = seleccionada?.nombre === m.nombre;
            return (
              <li key={m.id ?? m.nombre}>
                <button
                  role="option"
                  aria-selected={activa}
                  onClick={() => {
                    onCambiar(m);
                    setAbierto(false);
                  }}
                  className={`flex w-full flex-col px-4 py-2.5 text-left transition-colors duration-200 ${
                    activa ? "bg-cyan-50 dark:bg-cyan-500/10" : "hover:bg-slate-50 dark:hover:bg-slate-700/60"
                  }`}
                >
                  <span
                    className={`text-sm font-medium ${
                      activa ? "text-cyan-800 dark:text-cyan-300" : "text-slate-900 dark:text-slate-100"
                    }`}
                  >
                    {m.nombre}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">{m.profesor}</span>
                </button>
              </li>
            );
          })}
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
  const [periodoActivo, setPeriodoActivo] = useState("1");

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
      .then((data) => {
        const nueva = planillaVacia();
        for (const [clave, periodo] of Object.entries(data.cuatrimestres || {})) {
          if (nueva.cuatrimestres[clave]) {
            nueva.cuatrimestres[clave] = { ...nueva.cuatrimestres[clave], ...periodo };
          }
        }
        setCalif(nueva);
      })
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

  const resumenPeriodos = PERIODOS.map((periodo) => {
    const filas = calif.cuatrimestres?.[periodo.clave]?.filas || [];
    const registros = filas.filter((f) => f.fecha && f.detalle).length;
    const pendientes = filas.filter((f) => f.fecha && f.detalle && f.firmaDocente && !f.firmaPadre).length;
    const completadas = filas.filter((f) => f.firmaPadre).length;
    const partes = [`${registros} ${registros === 1 ? "registro" : "registros"}`];
    if (pendientes > 0) partes.push(`${pendientes} por firmar`);
    else if (completadas > 0) partes.push(`${completadas} ${completadas === 1 ? "firmada" : "firmadas"}`);
    return { ...periodo, registros, pendientes, completadas, descripcion: partes.join(" · ") };
  });
  const periodoSeleccionado = resumenPeriodos.find((p) => p.clave === periodoActivo) || resumenPeriodos[0];
  const registros = periodoSeleccionado.registros;
  const firmasPendientes = periodoSeleccionado.pendientes;
  const firmasCompletadas = periodoSeleccionado.completadas;

  return (
    <div>
      <SectionHeading
        eyebrow={CURRENT_USER.curso}
        title="Mis calificaciones"
        action={
          materias.length > 0 ? (
            <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-bold text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300">
              {materias.length} {materias.length === 1 ? "materia" : "materias"}
            </span>
          ) : null
        }
      />

      <SelectorMateria
        materias={materias}
        seleccionada={materiaSeleccionada}
        onCambiar={setMateriaSeleccionada}
        deshabilitado={cargandoMaterias}
      />

      {cargandoMaterias ? (
        <Skeleton className="h-24 w-full rounded-2xl" />
      ) : materias.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Todavía no tenés materias cargadas para tu curso"
          description="Cuando Dirección asigne materias a tu curso, vas a poder consultar tus notas acá."
        />
      ) : !materiaSeleccionada ? (
        <EmptyState icon={ClipboardCheck} title="Elegí una materia para ver tus calificaciones" />
      ) : cargandoCalif ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-2xl sm:max-w-md" />
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-4">
          <PeriodSelector
            value={periodoActivo}
            onChange={setPeriodoActivo}
            periodos={resumenPeriodos}
            className="sm:max-w-md"
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <StatResumen icon={ClipboardCheck} label="Ítems registrados" value={registros} tono="cyan" />
            <StatResumen icon={Lock} label="Esperando tu firma" value={firmasPendientes} tono="amber" />
            <StatResumen icon={BadgeCheck} label="Firmas completadas" value={firmasCompletadas} tono="emerald" />
          </div>

          {firmasPendientes > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="text-xs leading-relaxed">
                Tenés <strong>{firmasPendientes}</strong>{" "}
                {firmasPendientes === 1 ? "calificación pendiente" : "calificaciones pendientes"} de firma en{" "}
                {periodoSeleccionado.titulo}. Usá el PIN del responsable para confirmarlas.
              </p>
            </div>
          )}

          <TablaCuatrimestre
            key={periodoSeleccionado.clave}
            titulo={periodoSeleccionado.titulo}
            cuatrimestre={periodoSeleccionado.clave}
            datos={calif.cuatrimestres[periodoSeleccionado.clave]}
            materia={materiaSeleccionada}
            cursoInfo={cursoInfo}
            onFirmado={alFirmarFila}
          />
        </div>
      )}
    </div>
  );
}
