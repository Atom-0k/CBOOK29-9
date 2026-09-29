import { useState, useRef, useEffect } from "react";
import { ChevronDown, Save, Loader2, ClipboardCheck, PencilLine, X, Plus, Trash2 } from "lucide-react";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { CURRENT_USER, CURRENT_ASIGNACIONES, CONECTADO_A_DJANGO, MOCK_ALUMNOS_CURSO } from "../../data/mock";
import { getCsrfToken } from "../../utils/csrf";
import { DateInput } from "../../components/ui/DateInput";

const CUATRIMESTRES = ["1", "2"];

function formatFechaCorta(iso) {
  if (!iso) return "--/--/----";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function Selector({ label, opciones, valorTexto, onCambiar, deshabilitado }) {
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

export function CalificacionesView() {
  const cursos = CURRENT_ASIGNACIONES.filter((a) => a.materia);

  const [asignacionId, setAsignacionId] = useState(cursos[0]?._id || "");
  const [alumnos, setAlumnos] = useState([]);
  const [cargandoAlumnos, setCargandoAlumnos] = useState(false);
  const [errorAlumnos, setErrorAlumnos] = useState(null);
  const [alumnoGmail, setAlumnoGmail] = useState("");
  const [datos, setDatos] = useState({ "1": { filas: [], notaFinal: "" }, "2": { filas: [], notaFinal: "" } });
  const [cargandoDatos, setCargandoDatos] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  const [editando, setEditando] = useState({});
  const [borradores, setBorradores] = useState({});
  const [erroresFila, setErroresFila] = useState({});
  const [guardandoClave, setGuardandoClave] = useState(null);

  const [borradoresFinal, setBorradoresFinal] = useState({ "1": "", "2": "" });
  const [guardandoFinal, setGuardandoFinal] = useState(null);

  const cursoInfo = cursos.find((c) => c._id === asignacionId);
  const alumnoInfo = alumnos.find((a) => a.gmail === alumnoGmail);

  useEffect(() => {
    setAlumnoGmail("");
    setDatos({ "1": { filas: [], notaFinal: "" }, "2": { filas: [], notaFinal: "" } });
    setEditando({});
    setBorradores({});
    setErroresFila({});
    setBorradoresFinal({ "1": "", "2": "" });
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
    setBorradoresFinal({ "1": "", "2": "" });
    if (!alumnoGmail || !cursoInfo) return;
    if (!CONECTADO_A_DJANGO) return;

    setCargandoDatos(true);
    const params = new URLSearchParams({ curso: cursoInfo.curso, materia: cursoInfo.materia, alumno: alumnoGmail });
    fetch(`/api/calificaciones/?${params}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        const nuevo = { "1": { filas: [], notaFinal: "" }, "2": { filas: [], notaFinal: "" } };
        for (const [clave, c] of Object.entries(data.cuatrimestres || {})) {
          if (!nuevo[clave]) continue;
          if (Array.isArray(c.filas)) nuevo[clave].filas = c.filas;
          nuevo[clave].notaFinal = c.notaFinal || "";
        }
        setDatos(nuevo);
        setBorradoresFinal({ "1": nuevo["1"].notaFinal, "2": nuevo["2"].notaFinal });
      })
      .catch(() => setDatos({ "1": { filas: [], notaFinal: "" }, "2": { filas: [], notaFinal: "" } }))
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

    const existentes = datos[cuatrimestre].filas.map((f) => f.fila);
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
      setDatos((prev) => ({
        ...prev,
        [cuatrimestre]: {
          ...prev[cuatrimestre],
          filas: [...prev[cuatrimestre].filas, nuevaFila].sort((a, b) => a.fila - b.fila),
        },
      }));
      setEditando((prev) => { const n = { ...prev }; delete n[clave]; return n; });
      setBorradores((prev) => { const n = { ...prev }; delete n[clave]; return n; });
      setMensaje({ tipo: "ok", texto: `Item agregado en ${cuatrimestre}° cuatrimestre.` });
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
      setMensaje({ tipo: "ok", texto: `Fila ${fila} del ${cuatrimestre}° cuatrimestre guardada.` });
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
      setMensaje({ tipo: "ok", texto: `Item eliminado del ${cuatrimestre}° cuatrimestre.` });
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
      setMensaje({ tipo: "ok", texto: `Calificación final del ${cuatrimestre}° cuatrimestre guardada.` });
    } catch (err) {
      setMensaje({ tipo: "error", texto: err.message || "Error al guardar." });
    } finally {
      setGuardandoFinal(null);
    }
  }

  const inputClass =
    "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-cyan-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

  if (cursos.length === 0) {
    return (
      <div>
        <SectionHeading eyebrow={CURRENT_USER.rol} title="Calificaciones" />
        <EmptyState icon={ClipboardCheck} title="Todavía no tenés cursos/materias asignadas" />
      </div>
    );
  }

  return (
    <div>
      <SectionHeading eyebrow={CURRENT_USER.rol} title="Calificaciones" />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Selector
          label="Curso y materia"
          valorTexto={cursoInfo ? `${cursoInfo.curso} — ${cursoInfo.materia}` : ""}
          onCambiar={setAsignacionId}
          opciones={cursos.map((c) => ({
            key: c._id,
            titulo: c.curso,
            subtitulo: c.materia,
          }))}
        />
        <Selector
          label="Alumno"
          valorTexto={alumnoInfo?.nombre}
          deshabilitado={!cursoInfo || cargandoAlumnos}
          onCambiar={setAlumnoGmail}
          opciones={alumnos.map((a) => ({ key: a.gmail, titulo: a.nombre, subtitulo: a.gmail }))}
        />
      </div>

      {cargandoAlumnos && (
        <p className="mb-4 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          Buscando alumnos del curso...
        </p>
      )}
      {!cargandoAlumnos && errorAlumnos && (
        <p className="mb-4 rounded-lg px-3 py-2 text-xs bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
          {errorAlumnos}
        </p>
      )}
      {!cargandoAlumnos && !errorAlumnos && cursoInfo && alumnos.length === 0 && (
        <EmptyState icon={ClipboardCheck} title={`No se encontraron alumnos cargados para ${cursoInfo.curso}`} />
      )}

      {mensaje && (
        <p
          className={`mb-4 rounded-lg px-3 py-2 text-xs ${
            mensaje.tipo === "ok"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
              : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400"
          }`}
        >
          {mensaje.texto}
        </p>
      )}

      {!alumnoGmail ? (
        <EmptyState icon={ClipboardCheck} title="Elegí un alumno para cargar sus notas" />
      ) : cargandoDatos ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-4">
          {CUATRIMESTRES.map((cuatrimestre) => {
            const filasReales = datos[cuatrimestre].filas;
            const clavesNuevas = Object.keys(editando).filter((k) => k.startsWith(`nuevo-${cuatrimestre}-`));

            return (
              <div
                key={cuatrimestre}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="bg-cyan-800 px-4 py-2.5 dark:bg-cyan-700">
                  <h3 className="text-sm font-semibold text-white">{cuatrimestre}° Cuatrimestre</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800">
                        <th className="w-28 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          Fecha
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          Detalle
                        </th>
                        <th className="w-36 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          Firma docente
                        </th>
                        <th className="w-32 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          Firma padre
                        </th>
                        <th className="w-24 px-2 py-2" />
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
                            className="border-b border-slate-50 last:border-0 dark:border-slate-800/60"
                          >
                            <td className="px-2 py-2.5 text-center">
                              {enEdicion ? (
                                <DateInput
                                  value={borrador.fecha}
                                  onChange={(v) => actualizarBorrador(clave, "fecha", v)}
                                />
                              ) : (
                                <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                                  {formatFechaCorta(fila.fecha)}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              {enEdicion ? (
                                <input
                                  type="text"
                                  value={borrador.detalle}
                                  onChange={(e) => actualizarBorrador(clave, "detalle", e.target.value)}
                                  placeholder="Ej: Trabajo práctico N°1 — 8"
                                  className={`${inputClass} min-w-40`}
                                />
                              ) : (
                                <span className="text-slate-900 dark:text-slate-100">{fila.detalle || ""}</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2.5 text-center text-xs text-slate-500 dark:text-slate-400">
                              {fila.firmaDocente || ""}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2.5 text-center text-xs text-emerald-700 dark:text-emerald-400">
                              {fila.firmaPadre ? "Firmado" : "--"}
                            </td>
                            <td className="px-2 py-2.5 text-right">
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
                                    className="flex items-center gap-1 rounded-lg border border-rose-300 px-2 py-1 text-xs font-semibold text-rose-600 transition-colors duration-200 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-500/10"
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
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
                  <button
                    type="button"
                    onClick={() => agregarNuevoItem(cuatrimestre)}
                    className="flex items-center gap-1.5 rounded-lg border border-cyan-800 px-3 py-1.5 text-xs font-semibold text-cyan-800 transition-colors duration-200 hover:bg-cyan-50 dark:border-cyan-600 dark:text-cyan-400 dark:hover:bg-cyan-500/10"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Nuevo item
                  </button>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Calificación final
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={borradoresFinal[cuatrimestre]}
                      onChange={(e) =>
                        setBorradoresFinal((prev) => ({ ...prev, [cuatrimestre]: e.target.value }))
                      }
                      placeholder="--"
                      className={`${inputClass} w-20 text-center`}
                    />
                    <button
                      type="button"
                      onClick={() => guardarFinal(cuatrimestre)}
                      disabled={guardandoFinal === cuatrimestre}
                      className="flex items-center gap-1.5 rounded-lg bg-cyan-800 px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-200 hover:bg-cyan-900 disabled:opacity-60 dark:bg-cyan-600 dark:hover:bg-cyan-500"
                    >
                      {guardandoFinal === cuatrimestre ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Save className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Guardar
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
