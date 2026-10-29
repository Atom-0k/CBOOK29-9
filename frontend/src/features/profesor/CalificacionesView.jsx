import { useState, useRef, useEffect } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  ListChecks,
  Loader2,
  PenLine,
  PencilLine,
  Plus,
  Save,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { PeriodSelector } from "../../components/ui/PeriodSelector";
import { CURRENT_USER, CURRENT_ASIGNACIONES, CONECTADO_A_DJANGO, MOCK_ALUMNOS_CURSO } from "../../data/mock";
import { getCsrfToken } from "../../utils/csrf";
import { DateInput } from "../../components/ui/DateInput";

const PERIODOS = [
  { clave: "1", titulo: "1° Cuatrimestre", corto: "1°C" },
  { clave: "2", titulo: "2° Cuatrimestre", corto: "2°C" },
  { clave: "3", titulo: "Diciembre", corto: "DIC" },
  { clave: "4", titulo: "Febrero", corto: "FEB" },
  { clave: "5", titulo: "Marzo", corto: "MAR" },
];

function etiquetaPeriodo(clave) {
  return PERIODOS.find((p) => p.clave === clave)?.titulo || `${clave}° Cuatrimestre`;
}

function datosVacios() {
  return Object.fromEntries(PERIODOS.map(({ clave }) => [clave, { filas: [], notaFinal: "" }]));
}

function finalesVacios() {
  return Object.fromEntries(PERIODOS.map(({ clave }) => [clave, ""]));
}

function esFilaVacia(fila) {
  return !fila.fecha && !fila.detalle && !fila.firmaDocente && !fila.firmaPadre;
}

function formatFechaCorta(iso) {
  if (!iso) return "--/--/----";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function Selector({ label, opciones, valorTexto, onCambiar, deshabilitado, icon: Icon, seleccionado }) {
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
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={deshabilitado}
        onClick={() => setAbierto((a) => !a)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left shadow-sm transition-colors duration-200 hover:border-cyan-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-cyan-700 dark:hover:bg-slate-800"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {label}
            </span>
            <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {valorTexto || "Elegí una opción"}
            </span>
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
          {opciones.length === 0 ? (
            <li className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">Sin opciones disponibles</li>
          ) : (
            opciones.map((op) => {
              const activa = op.key === seleccionado;
              return (
                <li key={op.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={activa}
                    onClick={() => {
                      onCambiar(op.key);
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
                      {op.titulo}
                    </span>
                    {op.subtitulo && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">{op.subtitulo}</span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, tono = "cyan" }) {
  const tonos = {
    cyan: "bg-cyan-50 text-cyan-700 ring-cyan-600/10 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-400/20",
    emerald:
      "bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
    slate:
      "bg-slate-100 text-slate-600 ring-slate-500/10 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600/30",
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ${tonos[tono]}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-lg font-bold leading-tight text-slate-900 dark:text-slate-100">{value}</p>
        <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {label}
        </p>
      </div>
    </div>
  );
}

export function CalificacionesView() {
  const cursos = CURRENT_ASIGNACIONES.filter((a) => a.materia);

  const [asignacionId, setAsignacionId] = useState(cursos[0]?._id || "");
  const [alumnos, setAlumnos] = useState([]);
  const [cargandoAlumnos, setCargandoAlumnos] = useState(false);
  const [errorAlumnos, setErrorAlumnos] = useState(null);
  const [alumnoGmail, setAlumnoGmail] = useState("");
  const [datos, setDatos] = useState(datosVacios);
  const [cargandoDatos, setCargandoDatos] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  const [editando, setEditando] = useState({});
  const [borradores, setBorradores] = useState({});
  const [erroresFila, setErroresFila] = useState({});
  const [guardandoClave, setGuardandoClave] = useState(null);

  const [borradoresFinal, setBorradoresFinal] = useState(finalesVacios);
  const [guardandoFinal, setGuardandoFinal] = useState(null);
  const [periodoActivo, setPeriodoActivo] = useState("1");

  const cursoInfo = cursos.find((c) => c._id === asignacionId);
  const alumnoInfo = alumnos.find((a) => a.gmail === alumnoGmail);

  useEffect(() => {
    setAlumnoGmail("");
    setDatos(datosVacios());
    setEditando({});
    setBorradores({});
    setErroresFila({});
    setBorradoresFinal(finalesVacios());
    if (!cursoInfo) {
      setAlumnos([]);
      setErrorAlumnos(null);
      return;
    }
    if (!CONECTADO_A_DJANGO) {
      setAlumnos(MOCK_ALUMNOS_CURSO);
      setErrorAlumnos(null);
      return;
    }
    setAlumnos([]);
    setErrorAlumnos(null);
    setCargandoAlumnos(true);
    fetch(`/api/alumnos/?curso=${encodeURIComponent(cursoInfo.curso)}&asignacion=${encodeURIComponent(cursoInfo._id)}`, { credentials: "same-origin" })
      .then((r) => {
        if (r.status === 403) return r.json().then((d) => { throw new Error(d.error || "No autorizado."); });
        if (r.status === 404) return r.json().then((d) => { throw new Error(d.error || "Curso no existe."); });
        if (!r.ok) return r.json().then((d) => { throw new Error(d.error || "Error del servidor."); });
        return r.json();
      })
      .then((data) => setAlumnos(data.alumnos || []))
      .catch((err) => { setAlumnos([]); setErrorAlumnos(err.message); })
      .finally(() => setCargandoAlumnos(false));
  }, [asignacionId]);

  useEffect(() => {
    setEditando({});
    setBorradores({});
    setErroresFila({});
    setBorradoresFinal(finalesVacios());
    if (!alumnoGmail || !cursoInfo) return;
    if (!CONECTADO_A_DJANGO) return;

    setCargandoDatos(true);
    const params = new URLSearchParams({ curso: cursoInfo.curso, materia: cursoInfo.materia, alumno: alumnoGmail });
    fetch(`/api/calificaciones/?${params}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        const nuevo = datosVacios();
        for (const [clave, c] of Object.entries(data.cuatrimestres || {})) {
          if (!nuevo[clave]) continue;
          if (Array.isArray(c.filas)) nuevo[clave].filas = c.filas;
          nuevo[clave].notaFinal = c.notaFinal || "";
        }
        setDatos(nuevo);
        setBorradoresFinal(
          Object.fromEntries(PERIODOS.map(({ clave }) => [clave, nuevo[clave].notaFinal])),
        );
      })
      .catch(() => setDatos(datosVacios()))
      .finally(() => setCargandoDatos(false));
  }, [alumnoGmail]);

  function agregarNuevoItem(cuatrimestre) {
    const clave = `nuevo-${cuatrimestre}-${Date.now()}`;
    setBorradores((prev) => ({ ...prev, [clave]: { fecha: "", detalle: "" } }));
    setEditando((prev) => ({ ...prev, [clave]: true }));
    setErroresFila((prev) => ({ ...prev, [clave]: null }));
    setMensaje(null);
  }

  function empezarEdicionFila(cuatrimestre, fila) {
    const clave = `${cuatrimestre}-${fila}`;
    setBorradores((prev) => ({ ...prev, [clave]: { fecha: fila.fecha, detalle: fila.detalle } }));
    setEditando((prev) => ({ ...prev, [clave]: true }));
    setErroresFila((prev) => ({ ...prev, [clave]: null }));
    setMensaje(null);
  }

  function cancelarEdicionFila(clave) {
    setEditando((prev) => ({ ...prev, [clave]: false }));
    setBorradores((prev) => { const n = { ...prev }; delete n[clave]; return n; });
    setErroresFila((prev) => ({ ...prev, [clave]: null }));
  }

  function actualizarBorrador(clave, campo, valor) {
    setBorradores((prev) => ({ ...prev, [clave]: { ...prev[clave], [campo]: valor } }));
  }

  async function guardarNuevaFila(cuatrimestre, clave) {
    const { fecha, detalle } = borradores[clave] || { fecha: "", detalle: "" };
    if (!cursoInfo || !alumnoGmail) return;

    if (!CONECTADO_A_DJANGO) {
      setMensaje({ tipo: "error", texto: "Esto solo guarda de verdad cuando lo sirve Django." });
      return;
    }

    const existentes = datos[cuatrimestre].filas.filter((f) => !esFilaVacia(f)).map((f) => f.fila);
    const siguienteFila = existentes.length > 0 ? Math.max(...existentes) + 1 : 1;

    setGuardandoClave(clave);
    setErroresFila((prev) => ({ ...prev, [clave]: null }));
    try {
      const resp = await fetch("/api/calificaciones/guardar/", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
        body: JSON.stringify({
          curso: cursoInfo.curso,
          materia: cursoInfo.materia,
          alumnoGmail,
          cuatrimestre: Number(cuatrimestre),
          fila: siguienteFila,
          fecha,
          detalle,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "No se pudo guardar.");

      const nuevaFila = { fila: siguienteFila, fecha, detalle, firmaDocente: data.firmaDocente || "", firmaPadre: "" };
      setDatos((prev) => {
        const filas = prev[cuatrimestre].filas;
        const yaExiste = filas.some((f) => f.fila === siguienteFila);
        const actualizadas = yaExiste
          ? filas.map((f) => (f.fila === siguienteFila ? nuevaFila : f))
          : [...filas, nuevaFila];
        return {
          ...prev,
          [cuatrimestre]: {
            ...prev[cuatrimestre],
            filas: actualizadas.sort((a, b) => a.fila - b.fila),
          },
        };
      });
      setEditando((prev) => { const n = { ...prev }; delete n[clave]; return n; });
      setBorradores((prev) => { const n = { ...prev }; delete n[clave]; return n; });
      setMensaje({ tipo: "ok", texto: `Ítem agregado en ${etiquetaPeriodo(cuatrimestre)}.` });
    } catch (err) {
      setErroresFila((prev) => ({ ...prev, [clave]: err.message || "Error al guardar." }));
    } finally {
      setGuardandoClave(null);
    }
  }

  async function guardarFilaExistente(cuatrimestre, fila) {
    const clave = `${cuatrimestre}-${fila}`;
    const { fecha, detalle } = borradores[clave] || { fecha: "", detalle: "" };
    if (!cursoInfo || !alumnoGmail) return;

    setGuardandoClave(clave);
    setErroresFila((prev) => ({ ...prev, [clave]: null }));
    try {
      const resp = await fetch("/api/calificaciones/guardar/", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
        body: JSON.stringify({
          curso: cursoInfo.curso,
          materia: cursoInfo.materia,
          alumnoGmail,
          cuatrimestre: Number(cuatrimestre),
          fila,
          fecha,
          detalle,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "No se pudo guardar.");

      setDatos((prev) => ({
        ...prev,
        [cuatrimestre]: {
          ...prev[cuatrimestre],
          filas: prev[cuatrimestre].filas.map((f) =>
            f.fila === fila ? { ...f, fecha, detalle, firmaDocente: data.firmaDocente || f.firmaDocente } : f,
          ),
        },
      }));
      setEditando((prev) => ({ ...prev, [clave]: false }));
      setMensaje({ tipo: "ok", texto: `Fila ${fila} de ${etiquetaPeriodo(cuatrimestre)} guardada.` });
    } catch (err) {
      setErroresFila((prev) => ({ ...prev, [clave]: err.message || "Error al guardar." }));
    } finally {
      setGuardandoClave(null);
    }
  }

  async function eliminarFila(cuatrimestre, fila) {
    if (!cursoInfo || !alumnoGmail) return;
    if (!CONECTADO_A_DJANGO) {
      setMensaje({ tipo: "error", texto: "Esto solo elimina de verdad cuando lo sirve Django." });
      return;
    }

    const clave = `del-${cuatrimestre}-${fila}`;
    setGuardandoClave(clave);
    try {
      const resp = await fetch("/api/calificaciones/eliminar/", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
        body: JSON.stringify({
          curso: cursoInfo.curso,
          materia: cursoInfo.materia,
          alumnoGmail,
          cuatrimestre: Number(cuatrimestre),
          fila,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "No se pudo eliminar.");

      setDatos((prev) => ({
        ...prev,
        [cuatrimestre]: {
          ...prev[cuatrimestre],
          filas: prev[cuatrimestre].filas.filter((f) => f.fila !== fila),
        },
      }));
      setMensaje({ tipo: "ok", texto: `Ítem eliminado de ${etiquetaPeriodo(cuatrimestre)}.` });
    } catch (err) {
      setMensaje({ tipo: "error", texto: err.message || "Error al eliminar." });
    } finally {
      setGuardandoClave(null);
    }
  }

  async function guardarFinal(cuatrimestre) {
    const nota = (borradoresFinal[cuatrimestre] || "").trim();
    if (!cursoInfo || !alumnoGmail) return;

    if (!CONECTADO_A_DJANGO) {
      setMensaje({ tipo: "error", texto: "Esto solo guarda de verdad cuando lo sirve Django." });
      return;
    }

    setGuardandoFinal(cuatrimestre);
    setMensaje(null);
    try {
      const resp = await fetch("/api/calificaciones/final/", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
        body: JSON.stringify({
          curso: cursoInfo.curso,
          materia: cursoInfo.materia,
          alumnoGmail,
          cuatrimestre: Number(cuatrimestre),
          nota,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "No se pudo guardar.");

      setDatos((prev) => ({
        ...prev,
        [cuatrimestre]: { ...prev[cuatrimestre], notaFinal: nota },
      }));
      setMensaje({ tipo: "ok", texto: `Calificación final de ${etiquetaPeriodo(cuatrimestre)} guardada.` });
    } catch (err) {
      setMensaje({ tipo: "error", texto: err.message || "Error al guardar." });
    } finally {
      setGuardandoFinal(null);
    }
  }

  const inputClass =
    "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-600/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

  const resumenPeriodos = PERIODOS.map((periodo) => {
    const filas = (datos[periodo.clave]?.filas || []).filter((f) => !esFilaVacia(f));
    const registros = filas.length;
    const firmas = filas.filter((f) => f.firmaPadre).length;
    const pendientes = filas.filter((f) => f.firmaDocente && !f.firmaPadre).length;
    return {
      ...periodo,
      registros,
      firmas,
      pendientes,
      descripcion: `${registros} ${registros === 1 ? "ítem" : "ítems"} · ${firmas} ${
        firmas === 1 ? "firma" : "firmas"
      }`,
    };
  });
  const periodoSeleccionado = resumenPeriodos.find((p) => p.clave === periodoActivo) || resumenPeriodos[0];
  const totalFilas = periodoSeleccionado.registros;
  const firmasPadre = periodoSeleccionado.firmas;
  const sinAlumnos = Boolean(cursoInfo) && !cargandoAlumnos && !errorAlumnos && alumnos.length === 0;

  if (cursos.length === 0) {
    return (
      <div>
        <SectionHeading eyebrow={CURRENT_USER.rol} title="Calificaciones" />
        <EmptyState
          icon={ClipboardCheck}
          title="Todavía no tenés cursos/materias asignadas"
          description="Pedile a Dirección que revise tus asignaciones para poder cargar calificaciones."
        />
      </div>
    );
  }

  return (
    <div>
      <SectionHeading
        eyebrow={CURRENT_USER.rol}
        title="Calificaciones"
        action={
          cursoInfo ? (
            <span className="hidden rounded-full bg-cyan-100 px-3 py-1 text-xs font-bold text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300 sm:inline-flex">
              {alumnos.length} {alumnos.length === 1 ? "alumno" : "alumnos"}
            </span>
          ) : null
        }
      />

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-2.5 flex items-center gap-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Planilla de seguimiento
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <Selector
            icon={BookOpen}
            label="Curso y materia"
            valorTexto={cursoInfo ? `${cursoInfo.curso} — ${cursoInfo.materia}` : ""}
            seleccionado={asignacionId}
            onCambiar={setAsignacionId}
            opciones={cursos.map((c) => ({
              key: c._id,
              titulo: c.curso,
              subtitulo: c.materia,
            }))}
          />
          <Selector
            icon={UserRound}
            label="Alumno"
            valorTexto={alumnoInfo?.nombre}
            seleccionado={alumnoGmail}
            deshabilitado={!cursoInfo || cargandoAlumnos}
            onCambiar={setAlumnoGmail}
            opciones={alumnos.map((a) => ({ key: a.gmail, titulo: a.nombre, subtitulo: a.gmail }))}
          />
        </div>
      </div>

      {cargandoAlumnos && (
        <p className="mb-4 flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-600 dark:text-cyan-400" aria-hidden="true" />
          Buscando alumnos del curso...
        </p>
      )}
      {!cargandoAlumnos && errorAlumnos && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {errorAlumnos}
        </p>
      )}
      {sinAlumnos && (
        <EmptyState
          icon={Users}
          title={`No se encontraron alumnos cargados para ${cursoInfo.curso}`}
          description="Verificá que el curso tenga alumnos asignados o consultá con Dirección."
        />
      )}

      {mensaje && (
        <div
          className={`mb-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${
            mensaje.tipo === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
          }`}
        >
          {mensaje.tipo === "ok" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <p>{mensaje.texto}</p>
        </div>
      )}

      {alumnoGmail && alumnoInfo && !cargandoDatos && !cargandoAlumnos && (
        <>
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-700 to-teal-600 text-sm font-bold text-white">
                {alumnoInfo.nombre
                  .split(" ")
                  .slice(0, 2)
                  .map((p) => p[0])
                  .join("")
                  .toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{alumnoInfo.nombre}</p>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{alumnoInfo.gmail}</p>
              </div>
            </div>
            <MiniStat icon={ListChecks} label="Ítems del período" value={totalFilas} tono="cyan" />
            <MiniStat icon={PenLine} label="Firmas del período" value={firmasPadre} tono="emerald" />
          </div>
          <PeriodSelector
            value={periodoActivo}
            onChange={setPeriodoActivo}
            periodos={resumenPeriodos}
            className="mb-4 sm:max-w-md"
          />
        </>
      )}

      {sinAlumnos || errorAlumnos ? null : !alumnoGmail ? (
        <EmptyState
          icon={UserRound}
          title="Elegí un alumno para cargar sus notas"
          description="Seleccioná un alumno del curso para ver y editar su planilla de calificaciones."
        />
      ) : cargandoDatos ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl sm:max-w-md" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-4">
          {PERIODOS.filter(({ clave }) => clave === periodoActivo).map(({ clave: cuatrimestre, titulo }) => {
            const filasReales = datos[cuatrimestre].filas.filter((f) => !esFilaVacia(f));
            const clavesNuevas = Object.keys(editando).filter((k) => k.startsWith(`nuevo-${cuatrimestre}-`));

            return (
              <div
                key={cuatrimestre}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-cyan-900 to-teal-800 px-4 py-3 dark:from-cyan-800 dark:to-teal-700">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
                      <ListChecks className="h-4 w-4 text-cyan-50" aria-hidden="true" />
                    </span>
                    <h3 className="text-sm font-semibold text-white">{titulo}</h3>
                  </div>
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-50">
                    {filasReales.length} {filasReales.length === 1 ? "ítem" : "ítems"}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-sm">
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
                        <th className="w-32 px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Firma padre
                        </th>
                        <th className="w-32 px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filasReales.map((fila) => {
                        const clave = `${cuatrimestre}-${fila.fila}`;
                        const enEdicion = !!editando[clave];
                        const borrador = borradores[clave] || { fecha: "", detalle: "" };
                        const error = erroresFila[clave];

                        return (
                          <tr
                            key={fila.fila}
                            className={`border-b border-slate-100 transition-colors last:border-0 dark:border-slate-800/60 ${
                              enEdicion
                                ? "bg-cyan-50/60 dark:bg-cyan-500/5"
                                : "hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                            }`}
                          >
                            <td className="px-3 py-3 text-center">
                              {enEdicion ? (
                                <DateInput
                                  value={borrador.fecha}
                                  onChange={(v) => actualizarBorrador(clave, "fecha", v)}
                                />
                              ) : (
                                <span className="inline-flex whitespace-nowrap rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  {formatFechaCorta(fila.fecha)}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {enEdicion ? (
                                <input
                                  type="text"
                                  value={borrador.detalle}
                                  onChange={(e) => actualizarBorrador(clave, "detalle", e.target.value)}
                                  placeholder="Ej: Trabajo práctico N°1 — 8"
                                  className={`${inputClass} min-w-40`}
                                />
                              ) : (
                                <span className="font-medium text-slate-900 dark:text-slate-100">
                                  {fila.detalle || (
                                    <span className="text-xs italic font-normal text-slate-400 dark:text-slate-500">
                                      Sin detalle
                                    </span>
                                  )}
                                </span>
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
                            <td className="whitespace-nowrap px-3 py-3 text-center">
                              {fila.firmaPadre ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">
                                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                                  Firmado
                                </span>
                              ) : (
                                <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right">
                              {enEdicion ? (
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => cancelarEdicionFila(clave)}
                                    disabled={guardandoClave === clave}
                                    className="flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 transition-colors duration-200 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                  >
                                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => guardarFilaExistente(cuatrimestre, fila.fila)}
                                    disabled={guardandoClave === clave}
                                    className="flex items-center gap-1 rounded-lg bg-cyan-800 px-2.5 py-1 text-xs font-semibold text-white transition-colors duration-200 hover:bg-cyan-900 disabled:opacity-60 dark:bg-cyan-600 dark:hover:bg-cyan-500"
                                  >
                                    {guardandoClave === clave ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                    ) : (
                                      <Save className="h-3.5 w-3.5" aria-hidden="true" />
                                    )}
                                    Guardar
                                  </button>
                                </div>
                              ) : (
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => eliminarFila(cuatrimestre, fila.fila)}
                                    disabled={guardandoClave === `del-${cuatrimestre}-${fila.fila}`}
                                    aria-label={`Eliminar ítem ${fila.fila}`}
                                    title="Eliminar ítem"
                                    className="flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1.5 text-xs font-semibold text-rose-600 transition-colors duration-200 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => empezarEdicionFila(cuatrimestre, fila)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-cyan-800 px-2.5 py-1 text-xs font-semibold text-cyan-800 transition-colors duration-200 hover:bg-cyan-50 dark:border-cyan-600 dark:text-cyan-400 dark:hover:bg-cyan-500/10"
                                  >
                                    <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
                                    Editar
                                  </button>
                                </div>
                              )}
                              {error && (
                                <p className="mt-1 w-full text-right text-[11px] font-medium text-rose-600 dark:text-rose-400">
                                  {error}
                                </p>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {clavesNuevas.map((clave) => {
                        const borrador = borradores[clave] || { fecha: "", detalle: "" };
                        const error = erroresFila[clave];

                        return (
                          <tr
                            key={clave}
                            className="border-b border-slate-50 last:border-0 bg-amber-50/30 dark:bg-amber-500/5 dark:border-slate-800/60"
                          >
                            <td className="px-2 py-2.5 text-center">
                              <DateInput
                                value={borrador.fecha}
                                onChange={(v) => actualizarBorrador(clave, "fecha", v)}
                              />
                            </td>
                            <td className="px-4 py-2.5">
                              <input
                                type="text"
                                value={borrador.detalle}
                                onChange={(e) => actualizarBorrador(clave, "detalle", e.target.value)}
                                placeholder="Ej: Trabajo práctico N°1 — 8"
                                className={`${inputClass} min-w-40`}
                              />
                            </td>
                            <td className="px-2 py-2.5 text-center text-xs text-slate-400">—</td>
                            <td className="px-2 py-2.5 text-center text-xs text-slate-400">—</td>
                            <td className="px-2 py-2.5 text-right">
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => cancelarEdicionFila(clave)}
                                  disabled={guardandoClave === clave}
                                  className="flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 transition-colors duration-200 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => guardarNuevaFila(cuatrimestre, clave)}
                                  disabled={guardandoClave === clave}
                                  className="flex items-center gap-1 rounded-lg bg-cyan-800 px-2.5 py-1 text-xs font-semibold text-white transition-colors duration-200 hover:bg-cyan-900 disabled:opacity-60 dark:bg-cyan-600 dark:hover:bg-cyan-500"
                                >
                                  {guardandoClave === clave ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                  ) : (
                                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                                  )}
                                  Guardar
                                </button>
                              </div>
                              {error && (
                                <p className="mt-1 w-full text-right text-[11px] font-medium text-rose-600 dark:text-rose-400">
                                  {error}
                                </p>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {filasReales.length === 0 && clavesNuevas.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-10 text-center">
                            <div className="flex flex-col items-center gap-1.5">
                              <ClipboardCheck className="h-7 w-7 text-slate-300 dark:text-slate-600" aria-hidden="true" />
                              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                                Sin ítems en este período
                              </p>
                              <p className="text-xs text-slate-400 dark:text-slate-500">
                                Usá “Nuevo ítem” para agregar la primera calificación.
                              </p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-100 bg-gradient-to-r from-slate-50 to-cyan-50/50 px-4 py-3 dark:border-slate-800 dark:from-slate-800/60 dark:to-cyan-500/5 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => agregarNuevoItem(cuatrimestre)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-cyan-800 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-800 transition-colors duration-200 hover:bg-cyan-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 dark:border-cyan-600 dark:bg-slate-900 dark:text-cyan-400 dark:hover:bg-cyan-500/10"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Nuevo ítem
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Nota final
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={borradoresFinal[cuatrimestre]}
                        onChange={(e) =>
                          setBorradoresFinal((prev) => ({ ...prev, [cuatrimestre]: e.target.value }))
                        }
                        placeholder="--"
                        aria-label={`Calificación final de ${titulo}`}
                        className="w-14 rounded-md border border-slate-300 bg-white px-2 py-1 text-center text-sm font-bold text-slate-900 focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-600/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => guardarFinal(cuatrimestre)}
                      disabled={guardandoFinal === cuatrimestre}
                      className="flex items-center gap-1.5 rounded-lg bg-cyan-800 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-cyan-900 disabled:opacity-60 dark:bg-cyan-600 dark:hover:bg-cyan-500"
                    >
                      {guardandoFinal === cuatrimestre ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Save className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Guardar nota
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
