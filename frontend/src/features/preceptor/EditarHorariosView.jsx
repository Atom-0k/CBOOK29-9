import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, PencilLine, Save, X, Loader2, CalendarX, Plus, Trash2 } from "lucide-react";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { CURRENT_USER, CURRENT_ASIGNACIONES, CURRENT_HORARIO, CONECTADO_A_DJANGO } from "../../data/mock";
import { getCsrfToken } from "../../utils/csrf";
import { TimeInput } from "../../components/ui/TimeInput";

const DIAS_ORDEN = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes"];

function SelectorCurso({ cursos, seleccionado, onCambiar }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickAfuera(e) {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    }
    document.addEventListener("mousedown", onClickAfuera);
    return () => document.removeEventListener("mousedown", onClickAfuera);
  }, []);

  const seleccionadoObj = cursos.find((c) => c._id === seleccionado);
  const label = seleccionadoObj ? seleccionadoObj.curso : "";

  return (
    <div className="relative mb-5" ref={ref}>
      <button onClick={() => setAbierto((a) => !a)} aria-haspopup="listbox" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-colors duration-200 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800">
        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{label || "Elegí un curso"}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && (
        <ul role="listbox" className="absolute left-0 top-full z-20 mt-1.5 max-h-72 w-40 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {cursos.map((c) => (
            <li key={c._id}>
              <button onClick={() => { onCambiar(c._id); setAbierto(false); }} className={`block w-full px-4 py-2 text-left text-sm font-medium transition-colors duration-200 ${seleccionado === c._id ? "bg-teal-50 text-teal-800 dark:bg-teal-500/10 dark:text-teal-400" : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/60"}`}>{c.curso}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EditarHorariosView() {
  const cursosACargo = CURRENT_ASIGNACIONES.filter((a) => !a.materia);

  const [asignacionId, setAsignacionId] = useState(cursosACargo[0]?._id || "");
  const [horario, setHorario] = useState(CONECTADO_A_DJANGO ? null : CURRENT_HORARIO);
  const [cargando, setCargando] = useState(CONECTADO_A_DJANGO);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  const inputClass = "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
  const cursoSeleccionado = cursosACargo.find((c) => c._id === asignacionId)?.curso || "";

  const cargarHorario = useCallback((cursoAConsultar) => {
    if (!cursoAConsultar) return;
    if (!CONECTADO_A_DJANGO) { setHorario(CURRENT_HORARIO); return; }
    setCargando(true); setEditando(false); setMensaje(null);
    fetch(`/api/horarios/?curso=${encodeURIComponent(cursoAConsultar)}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => setHorario(data.dias || {}))
      .catch(() => setHorario({}))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => { cargarHorario(cursoSeleccionado); }, [cursoSeleccionado, cargarHorario]);

  function empezarEdicion() {
    setBorrador(JSON.parse(JSON.stringify(horario || {})));
    setEditando(true);
    setMensaje(null);
  }

  function cancelarEdicion() { setBorrador(null); setEditando(false); }

  function actualizarCampo(dia, index, campo, valor) {
    setBorrador((prev) => ({ ...prev, [dia]: prev[dia].map((clase, i) => (i === index ? { ...clase, [campo]: valor } : clase)) }));
  }

  function agregarBloque(dia) {
    setBorrador((prev) => ({ ...prev, [dia]: [...(prev[dia] || []), { Inicio: "", Fin: "", Materia: "", Profesor: "" }] }));
  }

  function eliminarBloque(dia, index) {
    setBorrador((prev) => ({ ...prev, [dia]: prev[dia].filter((_, i) => i !== index) }));
  }

  async function guardarCambios() {
    if (!CONECTADO_A_DJANGO) { setMensaje({ tipo: "error", texto: "Esto solo guarda de verdad cuando lo sirve Django." }); return; }
    setGuardando(true); setMensaje(null);
    try {
      const resp = await fetch("/api/horarios/guardar/", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
        body: JSON.stringify({ curso: cursoSeleccionado, dias: borrador }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "No se pudo guardar.");
      setHorario(borrador); setEditando(false); setBorrador(null);
      setMensaje({ tipo: "ok", texto: `Horario de ${cursoSeleccionado} guardado.` });
    } catch (err) {
      setMensaje({ tipo: "error", texto: err.message || "Ocurrió un error al guardar." });
    } finally {
      setGuardando(false);
    }
  }

  const datosAMostrar = editando ? borrador : horario;
  const hayHorario = datosAMostrar && DIAS_ORDEN.some((d) => (datosAMostrar[d] || []).length > 0);

  return (
    <div>
      <SectionHeading
        eyebrow={CURRENT_USER.rol}
        title="Editar Horarios"
        action={
          cursosACargo.length > 0 && !cargando ? (
            editando ? (
              <div className="flex gap-2">
                <button onClick={cancelarEdicion} disabled={guardando} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                  <X className="h-3.5 w-3.5" />Cancelar
                </button>
                <button onClick={guardarCambios} disabled={guardando} className="flex items-center gap-1.5 rounded-lg bg-cyan-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-900 disabled:opacity-60 dark:bg-cyan-600 dark:hover:bg-cyan-500">
                  {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {guardando ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            ) : (
              <button onClick={empezarEdicion} className="flex items-center gap-1.5 rounded-lg border border-cyan-800 px-3 py-1.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-50 dark:border-cyan-600 dark:text-cyan-400 dark:hover:bg-cyan-500/10">
                <PencilLine className="h-3.5 w-3.5" />Editar
              </button>
            )
          ) : null
        }
      />

      {cursosACargo.length === 0 ? (
        <EmptyState icon={CalendarX} title="No tenés ningún curso a cargo como Preceptor" description="Si esto no es correcto, pedile a Admin que revise tu asignación." />
      ) : (
        <>
          <SelectorCurso cursos={cursosACargo} seleccionado={asignacionId} onCambiar={setAsignacionId} />

          {mensaje && (
            <p className={`mb-4 rounded-lg px-3 py-2 text-xs ${mensaje.tipo === "ok" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400"}`}>{mensaje.texto}</p>
          )}
          {editando && !mensaje && (
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
              Modo edición — tocá cualquier horario, materia o profesor para cambiarlo, y después "Guardar cambios".
            </p>
          )}

          {cargando ? (
            <div className="space-y-4">{DIAS_ORDEN.map((d) => <Skeleton key={d} className="h-28 w-full rounded-xl" />)}</div>
          ) : !editando && !hayHorario ? (
            <EmptyState icon={CalendarX} title={`Todavía no hay horario cargado para ${cursoSeleccionado}`} />
          ) : (
            <div className="space-y-4">
              {DIAS_ORDEN.map((dia) => {
                const clases = (datosAMostrar && datosAMostrar[dia]) || [];
                if (!editando && clases.length === 0) return null;
                return (
                  <div key={dia} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{dia}</h3>
                    </div>

                    {clases.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">Sin clases este día.</p>
                    ) : (
                      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {clases.map((c, i) =>
                          editando ? (
                            <li key={i} className="flex flex-wrap items-center gap-2 px-4 py-3">
                              <TimeInput value={c.Inicio} onChange={(v) => actualizarCampo(dia, i, "Inicio", v)} />
                              <span className="text-slate-400">-</span>
                              <TimeInput value={c.Fin} onChange={(v) => actualizarCampo(dia, i, "Fin", v)} />
                              <input type="text" value={c.Materia} onChange={(e) => actualizarCampo(dia, i, "Materia", e.target.value)} placeholder="Materia" className={`${inputClass} min-w-[140px] flex-1`} />
                              <input type="text" value={c.Profesor} onChange={(e) => actualizarCampo(dia, i, "Profesor", e.target.value)} placeholder="Profesor" className={`${inputClass} min-w-[140px] flex-1`} />
                              <button type="button" onClick={() => eliminarBloque(dia, i)} title="Eliminar este horario" className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-rose-500 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </li>
                          ) : (
                            <li key={i} className="flex items-center gap-3 px-4 py-3">
                              <span className="w-24 shrink-0 text-xs font-medium text-slate-400 dark:text-slate-500">{c.Inicio} - {c.Fin}</span>
                              <div className="min-w-0 flex-1">
                                <p className="scroll-slide text-sm font-medium text-cyan-800 dark:text-cyan-400">{c.Materia}</p>
                                <p className="scroll-slide text-xs text-slate-500 dark:text-slate-400">{c.Profesor}</p>
                              </div>
                            </li>
                          )
                        )}
                      </ul>
                    )}

                    {editando && (
                      <div className="border-t border-slate-100 px-4 py-2 dark:border-slate-800">
                        <button type="button" onClick={() => agregarBloque(dia)} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-cyan-700 hover:bg-cyan-50 dark:text-cyan-400 dark:hover:bg-cyan-500/10">
                          <Plus className="h-3.5 w-3.5" />Añadir horario a {dia}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
