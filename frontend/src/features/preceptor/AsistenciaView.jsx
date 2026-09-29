import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, X, Clock, Save, Loader2, CalendarDays, ClipboardList, FileText, UserCheck } from "lucide-react";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { ActasGuardadas } from "../../components/asistencia/ActasGuardadas";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { Selector } from "../../components/ui/Selector";
import { DateInput } from "../../components/ui/DateInput";
import { TimeInput } from "../../components/ui/TimeInput";
import { Modal, ConfirmDialog } from "../../components/admin/Modal";
import { CURRENT_USER, CURRENT_ASIGNACIONES, CONECTADO_A_DJANGO, MOCK_ALUMNOS_CURSO, MATERIAS_MOCK } from "../../data/mock";
import { apiGet, apiPost, hoyIso } from "../../components/admin/adminApi";

const TURNOS = ["Mañana", "Tarde", "Contraturno", "Noche"];

const ESTADO_CLASE = {
  Presente: "bg-emerald-100 text-emerald-800 ring-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-400",
  Ausente: "bg-rose-100 text-rose-800 ring-rose-600 dark:bg-rose-500/20 dark:text-rose-300 dark:ring-rose-400",
  Tarde: "bg-amber-100 text-amber-800 ring-amber-600 dark:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-400",
};

function formatEstado(estado) {
  return estado || "Sin marcar";
}

export function AsistenciaView({ preset } = {}) {
  // Un preceptor puede tener los dos roles. La asistencia institucional
  // ("jornada/turno") sólo la puede tomar quien es preceptor del curso; la
  // asistencia por materia la puede tomar el profesor de esa materia (o el
  // preceptor del curso). Antes el selector de curso sólo miraba las
  // asignaciones SIN materia, así que a un preceptor-profesor no le aparecía
  // ningún curso donde toma clase, aunque el backend se lo permitiera.
  const cursosACargo = useMemo(() => {
    const s = new Set();
    const porCurso = new Map();
    for (const a of CURRENT_ASIGNACIONES) {
      if (!a?.curso) continue;
      if (a.materia) {
        if (!porCurso.has(a.curso)) porCurso.set(a.curso, new Set());
        porCurso.get(a.curso).add(a.materia);
      } else {
        s.add(a.curso);
      }
    }
    return { aCargo: s, materiasPorCurso: porCurso };
  }, []);

  const [tipo, setTipo] = useState(() => {
    const pedido = preset?.tipo;
    if (pedido === "institucional" && cursosACargo.aCargo.size === 0) return "materia";
    if (pedido === "materia" && !preset?.curso && cursosACargo.materiasPorCurso.size === 0) {
      return "institucional";
    }
    return pedido || "institucional";
  });
  // Institucional: sólo los cursos a cargo. Por materia: sólo los cursos donde
  // dicta. Ser preceptor de un curso NO habilita a marcar las materias de otros
  // profesores de ese curso, así que un curso a cargo sin materia propia no
  // aparece en el modo "Por materia".
  const cursosDisponibles = useMemo(() => {
    if (tipo === "institucional") return [...cursosACargo.aCargo];
    return [...cursosACargo.materiasPorCurso.keys()];
  }, [tipo, cursosACargo]);

  const [curso, setCurso] = useState(() => {
    const pedido = preset?.curso;
    if (pedido && (cursosACargo.aCargo.has(pedido) || cursosACargo.materiasPorCurso.has(pedido))) {
      return pedido;
    }
    return [...cursosACargo.aCargo][0] || [...cursosACargo.materiasPorCurso.keys()][0] || "";
  });
  const [turno, setTurno] = useState("Mañana");
  const [materia, setMateria] = useState(() => {
    const propias = [...(cursosACargo.materiasPorCurso.get(curso) || [])];
    return propias[0] || "";
  });
  const [fecha, setFecha] = useState(hoyIso());
  const [alumnos, setAlumnos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [confirmarGuardado, setConfirmarGuardado] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [justificar, setJustificar] = useState(null);
  const [tardes, setTardes] = useState({});
  // Se incrementa al guardar para que la lista de actas se vuelva a consultar.
  const [actasRef, setActasRef] = useState(0);

  const esCursoACargo = cursosACargo.aCargo.has(curso);
  // Sólo las materias que dicta en el curso elegido. No se piden al backend las
  // materias del curso: aunque vinieran, no habilitan a marcarlas, y ofrecerlas
  // sólo producía 403 al guardar.
  const materiasPermitidas = useMemo(
    () => [...(cursosACargo.materiasPorCurso.get(curso) || [])],
    [curso, cursosACargo],
  );

  const esProfesor = cursosACargo.materiasPorCurso.size > 0;

  // Cambiar de curso o de tipo puede dejar `materia` sin sentido: se realinea
  // con el curso elegido en vez de dejar una combinación que el backend rechaza.
  function elegirCurso(nuevo) {
    const propias = [...(cursosACargo.materiasPorCurso.get(nuevo) || [])];
    setCurso(nuevo);
    if (!propias.includes(materia)) setMateria(propias[0] || "");
  }

  function cambiarTipo(nuevo) {
    setTipo(nuevo);
    if (nuevo === "materia") {
      const valido = cursosACargo.materiasPorCurso.has(curso);
      const destino = valido ? curso : [...cursosACargo.materiasPorCurso.keys()][0] || "";
      const propias = [...(cursosACargo.materiasPorCurso.get(destino) || [])];
      setCurso(destino);
      setMateria(propias[0] || "");
    } else {
      setMateria("");
      if (!cursosACargo.aCargo.has(curso)) {
        const destino = [...cursosACargo.aCargo][0] || "";
        setCurso(destino);
      }
    }
  }

  const cargar = useCallback(() => {
    setMensaje(null);
    setTardes({});
    if (!curso) {
      setAlumnos([]);
      return;
    }
    // Al cambiar a "Por materia" hay un instante en que `materia` todavía está
    // vacía (se setea cuando llegan las materias del curso). Consultar con
    // materia="" haría un request que el backend rechaza y que sólo genera un
    // error en pantalla.
    if (tipo === "materia" && !materia) {
      setAlumnos([]);
      return;
    }
    if (!CONECTADO_A_DJANGO) {
      setAlumnos(
        MOCK_ALUMNOS_CURSO.map((a) => ({
          gmail: a.gmail,
          nombre: a.nombre,
          estado: null,
          estadoOriginal: null,
          minutosRetraso: null,
          horaIngreso: null,
          observacion: "",
          justificacion: null,
        })),
      );
      return;
    }
    setCargando(true);
    const params = new URLSearchParams({ curso, fecha, tipo });
    if (tipo === "institucional") params.set("turno", turno.toLowerCase());
    else params.set("materia", materia);
    apiGet(`/api/asistencia/preceptor/?${params}`)
      .then((d) =>
        setAlumnos(
          (d.alumnos || []).map((a) => ({
            ...a,
            estadoOriginal: a.estado || null,
            minutosRetraso: a.minutosRetraso ?? null,
            horaIngreso: a.horaIngreso || "",
            observacion: a.observacion || "",
          })),
        ),
      )
      .catch((e) => setMensaje({ tipo: "error", texto: e.message || "No se pudieron cargar los alumnos." }))
      .finally(() => setCargando(false));
  }, [curso, fecha, tipo, turno, materia]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function marcar(gmail, estado) {
    setAlumnos((prev) =>
      prev.map((a) => {
        if (a.gmail !== gmail) return a;
        if (estado === "Tarde") return a;
        return { ...a, estado: a.estado === estado ? null : estado };
      }),
    );
  }

  function marcarTarde(gmail) {
    const alumno = alumnos.find((a) => a.gmail === gmail);
    if (!alumno) return;
    if (alumno.estado === "Tarde") {
      setTardes((prev) => {
        const n = { ...prev };
        delete n[gmail];
        return n;
      });
      setAlumnos((prev) =>
        prev.map((a) => (a.gmail === gmail ? { ...a, estado: null, minutosRetraso: null, horaIngreso: null } : a)),
      );
    } else {
      setAlumnos((prev) =>
        prev.map((a) => (a.gmail === gmail ? { ...a, estado: "Tarde", minutosRetraso: 0, horaIngreso: "" } : a)),
      );
    }
  }

  function actualizarTarde(gmail, campo, valor) {
    setTardes((prev) => ({ ...prev, [gmail]: { ...(prev[gmail] || {}), [campo]: valor } }));
  }

  function pedirGuardado() {
    const cambios = alumnos.filter((a) => a.estado && a.estado !== a.estadoOriginal);
    if (cambios.length === 0) {
      setMensaje({ tipo: "error", texto: "No hay cambios para guardar." });
      return;
    }
    if (cambios.length >= 5) {
      setConfirmarGuardado({ cantidad: cambios.length });
    } else {
      guardar();
    }
  }

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    try {
      const registros = alumnos.map((a) => {
        const tarde = tardes[a.gmail];
        return {
          gmail: a.gmail,
          estado: a.estado || null,
          minutosRetraso: a.estado === "Tarde" ? (tarde?.minutos ?? a.minutosRetraso) ?? 0 : null,
          horaIngreso: a.estado === "Tarde" ? (tarde?.hora ?? a.horaIngreso) || "" : "",
          observacion: a.observacion || "",
        };
      });
      const body = { curso, fecha, tipo, registros };
      if (tipo === "institucional") body.turno = turno.toLowerCase();
      else body.materia = materia;

      let avisos = 0;
      if (CONECTADO_A_DJANGO) {
        const r = await apiPost("/api/asistencia/preceptor/guardar/", body);
        avisos = r?.notificaciones || 0;
        // El backend archiva un acta con el estado ya persistido; avisamos si falló.
        if (r && r.acta === null) {
          setActasRef((n) => n + 1);
          setMensaje({
            tipo: "error",
            texto: "Asistencia guardada, pero no se pudo archivar el acta. Probá de nuevo.",
          });
          return;
        }
      }
      setConfirmarGuardado(null);
      setActasRef((n) => n + 1);
      // Se menciona el aviso a las familias: es una acción que sale de la
      // escuela y el docente tiene que saber que ocurrió.
      setMensaje({
        tipo: "ok",
        texto: avisos > 0
          ? `Asistencia guardada y acta archivada. Se avisó a ${avisos} ${avisos === 1 ? "contacto" : "contactos"} por inasistencia.`
          : "Asistencia guardada y acta archivada.",
      });
      setAlumnos((prev) => prev.map((a) => ({ ...a, estadoOriginal: a.estado || null })));
    } catch (e) {
      setMensaje({ tipo: "error", texto: e.message || "Ocurrió un error al guardar." });
    } finally {
      setGuardando(false);
    }
  }

  const alumnosConEstado = alumnos.filter((a) => a.estado);
  const hayCambios = alumnos.filter((a) => a.estado && a.estado !== a.estadoOriginal).length;

  return (
    <div>
      <SectionHeading eyebrow={CURRENT_USER.rol} title="Asistencia" />

      {cursosDisponibles.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title={
            tipo === "institucional"
              ? "No tenés cursos a cargo como Preceptor"
              : "No tenés cursos donde tomar asistencia"
          }
          description="Si esto no es correcto, pedile a Admin que revise tu asignación."
        />
      ) : (
        <>
          {/* Tipo */}
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => cambiarTipo("institucional")}
              disabled={cursosACargo.aCargo.size === 0}
              title={cursosACargo.aCargo.size === 0 ? "La asistencia institucional sólo corresponde a cursos a cargo." : undefined}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
                tipo === "institucional"
                  ? "bg-cyan-800 text-white dark:bg-cyan-600"
                  : "border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              Institucional (turno)
            </button>
            <button
              type="button"
              onClick={() => cambiarTipo("materia")}
              disabled={!esProfesor && cursosACargo.aCargo.size === 0}
              title={!esProfesor && cursosACargo.aCargo.size === 0 ? "No tenés materias asignadas." : undefined}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
                tipo === "materia"
                  ? "bg-cyan-800 text-white dark:bg-cyan-600"
                  : "border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              Por materia
            </button>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Selector
              label="Curso"
              valorTexto={curso}
              onCambiar={elegirCurso}
              opciones={cursosDisponibles.map((c) => ({
                key: c,
                titulo: cursosACargo.aCargo.has(c) ? `${c} (a cargo)` : c,
              }))}
            />
            {tipo === "institucional" ? (
              <Selector
                label="Turno"
                valorTexto={turno}
                onCambiar={setTurno}
                opciones={TURNOS.map((t) => ({ key: t, titulo: t }))}
              />
            ) : (
              <Selector
                label="Materia"
                valorTexto={materia || ""}
                deshabilitado={materiasPermitidas.length === 0}
                onCambiar={setMateria}
                opciones={materiasPermitidas.map((m) => ({ key: m, titulo: m }))}
              />
            )}
            <div>
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Fecha
              </span>
              <DateInput value={fecha} onChange={setFecha} />
            </div>
          </div>

          {tipo === "materia" && esCursoACargo && (
            <p className="mb-4 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              En {curso} sos preceptor: la asistencia por materia sólo se marca
              para las materias que dictás. La del turno va en
              &quot;Institucional&quot;.
            </p>
          )}

          {mensaje && (
            <p className={`mb-4 rounded-lg px-3 py-2 text-xs ${mensaje.tipo === "ok" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400"}`}>
              {mensaje.texto}
            </p>
          )}

          {cargando ? (
            <Skeleton className="h-72 w-full rounded-xl" />
          ) : alumnos.length === 0 ? (
            <EmptyState icon={CalendarDays} title={`No hay alumnos cargados para ${curso}`} />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/60">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <ClipboardList className="h-4 w-4" aria-hidden="true" />
                  {tipo === "institucional" ? `${fecha} · Turno ${turno}` : `${fecha} · ${materia || "Sin materia"}`}
                </div>
                <div className="flex items-center gap-2">
                  {alumnosConEstado.length > 0 && (
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                      {alumnosConEstado.length}/{alumnos.length} marcados
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={pedirGuardado}
                    disabled={guardando || hayCambios === 0}
                    className="flex items-center gap-1.5 rounded-lg bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-cyan-800 disabled:opacity-50"
                  >
                    {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />}
                    {guardando ? "Guardando…" : "Guardar asistencia"}
                  </button>
                </div>
              </div>

              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {alumnos.map((a) => (
                  <li key={a.gmail} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="scroll-slide text-sm font-semibold text-slate-900 dark:text-slate-100">{a.nombre}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{a.gmail}</p>
                    </div>

                    {a.justificacion && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        <FileText className="h-3 w-3" aria-hidden="true" />
                        {a.justificacion.estado === "Justificada" ? "Justificada" : a.justificacion.estado === "Rechazada" ? "Rechazada" : "Pendiente"}
                      </span>
                    )}

                    <div className="flex items-center gap-1.5">
                      {(["Presente", "Ausente", "Tarde"]).map((estado) => (
                        <button
                          key={estado}
                          type="button"
                          onClick={() => (estado === "Tarde" ? marcarTarde(a.gmail) : marcar(a.gmail, estado))}
                          title={`Marcar ${estado}`}
                          className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                            a.estado === estado
                              ? ESTADO_CLASE[estado]
                              : "border-slate-200 text-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-500 dark:hover:bg-slate-800"
                          }`}
                        >
                          {estado === "Presente" ? <Check className="h-4 w-4" /> : estado === "Ausente" ? <X className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                        </button>
                      ))}
                    </div>

                    {a.estado === "Tarde" && (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-500/10">
                        <div>
                          <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Hora de entrada</span>
                          <TimeInput value={tardes[a.gmail]?.hora ?? a.horaIngreso ?? ""} onChange={(v) => actualizarTarde(a.gmail, "hora", v)} />
                        </div>
                        <div>
                          <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Minutos de retraso</span>
                          <input
                            type="number"
                            min="0"
                            max="300"
                            value={tardes[a.gmail]?.minutos ?? a.minutosRetraso ?? 0}
                            onChange={(e) => actualizarTarde(a.gmail, "minutos", Number(e.target.value) || 0)}
                            className="w-20 rounded-md border border-amber-300 bg-white px-2 py-1 text-sm text-amber-900 focus:border-amber-600 focus:outline-none dark:border-amber-600/50 dark:bg-slate-800 dark:text-amber-100"
                          />
                        </div>
                      </div>
                    )}

                    {(a.estado === "Ausente" || a.estado === "Tarde") && (
                      <button
                        type="button"
                        onClick={() => setJustificar({ gmail: a.gmail, nombre: a.nombre, turno, fecha })}
                        className="inline-flex items-center gap-1 rounded-lg border border-cyan-800 px-2.5 py-1.5 text-xs font-semibold text-cyan-800 transition-colors hover:bg-cyan-50 dark:border-cyan-600 dark:text-cyan-400 dark:hover:bg-cyan-500/10"
                      >
                        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                        Justificar
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  ✓ Presente · ✕ Ausente · 🕐 Tarde (se computa 0,25 si llega dentro de la tolerancia).
                  Una ausencia cuenta 1; con doble turno o contraturno, 0,5 por turno.
                </p>
              </div>
            </div>
          )}

          <ActasGuardadas curso={curso} refrescar={actasRef} />
        </>
      )}

      <ConfirmDialog
        open={!!confirmarGuardado}
        onClose={() => !guardando && setConfirmarGuardado(null)}
        onConfirm={guardar}
        title="Guardar muchos cambios"
        text={`Vas a guardar ${confirmarGuardado?.cantidad ?? 0} cambios de asistencia. ¿Confirmás?`}
        confirmLabel="Guardar todo"
        cargando={guardando}
      />

      <Modal
        open={!!justificar}
        onClose={() => !guardando && setJustificar(null)}
        title="Justificar inasistencia"
        subtitle={justificar ? `${justificar.nombre} · ${justificar.fecha}` : ""}
      >
        <JustificacionForm gmail={justificar?.gmail} turno={justificar?.turno} fecha={justificar?.fecha} onCerrado={() => setJustificar(null)} onGuardado={(msg) => { setJustificar(null); setMensaje({ tipo: "ok", texto: msg }); cargar(); }} />
      </Modal>
    </div>
  );
}

function JustificacionForm({ gmail, turno, fecha, onCerrado, onGuardado }) {
  const [form, setForm] = useState(() => ({
    tipoJustificacion: "nota",
    motivo: "",
    fechaPresentacion: hoyIso(),
    fechaInasistencia: fecha,
    observacion: "",
    estado: "Pendiente",
    certificado: "",
  }));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function guardar() {
    if (!form.motivo.trim()) {
      setError("Completá el motivo de la justificación.");
      return;
    }
    if (!form.fechaPresentacion) {
      setError("Completá la fecha de presentación.");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      const body = {
        gmail,
        turno: turno?.toLowerCase(),
        fecha,
        tipoJustificacion: form.tipoJustificacion,
        motivo: form.motivo.trim(),
        fechaPresentacion: form.fechaPresentacion,
        fechaInasistencia: form.fechaInasistencia,
        observacion: form.observacion.trim(),
        estado: form.estado,
        certificado: form.certificado.trim(),
      };
      if (CONECTADO_A_DJANGO) {
        await apiPost("/api/asistencia/justificar/", body);
      }
      onGuardado("Justificación registrada.");
    } catch (e) {
      setError(e.message || "Ocurrió un error al guardar la justificación.");
    } finally {
      setGuardando(false);
    }
  }

  const inputClase =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tipo</label>
          <select className={inputClase} value={form.tipoJustificacion} onChange={set("tipoJustificacion")}>
            <option value="nota">Nota del responsable</option>
            <option value="certificado">Certificado médico</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Estado</label>
          <select className={inputClase} value={form.estado} onChange={set("estado")}>
            <option value="Pendiente">Pendiente</option>
            <option value="Justificada">Justificada</option>
            <option value="Rechazada">Rechazada</option>
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Motivo</label>
        <input className={inputClase} value={form.motivo} onChange={set("motivo")} placeholder="Ej: Inasistencia por enfermedad" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Fecha de presentación</label>
          <DateInput value={form.fechaPresentacion} onChange={(v) => setForm((f) => ({ ...f, fechaPresentacion: v }))} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Fecha de la inasistencia</label>
          <DateInput value={form.fechaInasistencia} onChange={(v) => setForm((f) => ({ ...f, fechaInasistencia: v }))} />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Certificado <span className="normal-case font-normal">(opcional)</span>
        </label>
        <input className={inputClase} value={form.certificado} onChange={set("certificado")} placeholder="Ej: Certificado N° 123 del Hospital Municipal" />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Observaciones</label>
        <textarea className={inputClase} rows={2} value={form.observacion} onChange={set("observacion")} placeholder="Aclaraciones si hacen falta" />
      </div>

      {error && <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCerrado}
          disabled={guardando}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="flex items-center gap-1.5 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-800 disabled:opacity-50"
        >
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          {guardando ? "Guardando…" : "Guardar justificación"}
        </button>
      </div>
    </div>
  );
}
