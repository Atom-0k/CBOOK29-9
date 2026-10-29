import { useCallback, useEffect, useState } from "react";
import { Check, X, Save, Loader2, ClipboardCheck } from "lucide-react";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { ActasGuardadas } from "../../components/asistencia/ActasGuardadas";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { Selector } from "../../components/ui/Selector";
import { DateInput } from "../../components/ui/DateInput";
import { CURRENT_USER, CURRENT_ASIGNACIONES, CONECTADO_A_DJANGO, MOCK_ALUMNOS_CURSO } from "../../data/mock";
import { apiGet, apiPost, hoyIso } from "../../components/admin/adminApi";

const ESTADO_CLASE = {
  Presente: "bg-emerald-100 text-emerald-800 ring-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-400",
  Ausente: "bg-rose-100 text-rose-800 ring-rose-600 dark:bg-rose-500/20 dark:text-rose-300 dark:ring-rose-400",
  Tarde: "bg-amber-100 text-amber-800 ring-amber-600 dark:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-400",
};

const ESTADO_RESUMEN = {
  cumple: { label: "Cumple", texto: "text-emerald-700 dark:text-emerald-400", fondo: "bg-emerald-50 dark:bg-emerald-500/10" },
  cerca: { label: "Cerca del mínimo", texto: "text-amber-700 dark:text-amber-400", fondo: "bg-amber-50 dark:bg-amber-500/10" },
  no_cumple: { label: "Requiere intensificación", texto: "text-rose-700 dark:text-rose-400", fondo: "bg-rose-50 dark:bg-rose-500/10" },
  sin_datos: { label: "Sin clases", texto: "text-slate-500 dark:text-slate-400", fondo: "bg-slate-50 dark:bg-slate-800" },
};

export function AsistenciaView({ preset } = {}) {
  const asignadas = CURRENT_ASIGNACIONES.filter((a) => a.materia);
  const claveInicial = (() => {
    const pedida = preset?.curso
      ? asignadas.find((a) => a.curso === preset.curso)
      : null;
    if (pedida) return `${pedida.curso}||${pedida.materia}`;
    return asignadas[0] ? `${asignadas[0].curso}||${asignadas[0].materia}` : "";
  })();

  const [claveCurso, setClaveCurso] = useState(claveInicial);
  const [fecha, setFecha] = useState(hoyIso());
  const [alumnos, setAlumnos] = useState([]);
  const [resumen, setResumen] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  // Se incrementa al guardar para que la lista de actas se vuelva a consultar.
  const [actasRef, setActasRef] = useState(0);

  const cursoInfo = asignadas.find((c) => `${c.curso}||${c.materia}` === claveCurso);

  const cargar = useCallback(() => {
    setMensaje(null);
    if (!cursoInfo) {
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
      setResumen([
        { gmail: MOCK_ALUMNOS_CURSO[0].gmail, nombre: MOCK_ALUMNOS_CURSO[0].nombre, clases: 12, asistidas: 11, porcentaje: 91.7, estado: "cumple", requiere_intensificacion: false },
        { gmail: MOCK_ALUMNOS_CURSO[1].gmail, nombre: MOCK_ALUMNOS_CURSO[1].nombre, clases: 9, asistidas: 6, porcentaje: 66.7, estado: "no_cumple", requiere_intensificacion: true },
        { gmail: MOCK_ALUMNOS_CURSO[2].gmail, nombre: MOCK_ALUMNOS_CURSO[2].nombre, clases: 8, asistidas: 8, porcentaje: 100, estado: "cumple", requiere_intensificacion: false },
      ]);
      return;
    }
    setCargando(true);
    const params = new URLSearchParams({ curso: cursoInfo.curso, materia: cursoInfo.materia, fecha });
    apiGet(`/api/asistencia/profesor/?${params}`)
      .then((d) => {
        setAlumnos(
          (d.alumnos || []).map((a) => ({
            ...a,
            estadoOriginal: a.estado || null,
            minutosRetraso: a.minutosRetraso ?? null,
            horaIngreso: a.horaIngreso || "",
            observacion: a.observacion || "",
          })),
        );
        setResumen(d.resumen || []);
      })
      .catch((e) => setMensaje({ tipo: "error", texto: e.message || "No se pudieron cargar los alumnos." }))
      .finally(() => setCargando(false));
  }, [cursoInfo, fecha]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function marcar(gmail, estado) {
    setAlumnos((prev) =>
      prev.map((a) => (a.gmail === gmail ? { ...a, estado: a.estado === estado ? null : estado } : a)),
    );
  }

  const hayCambios = alumnos.filter((a) => a.estado && a.estado !== a.estadoOriginal).length;

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    try {
      const registros = alumnos.map((a) => ({
        gmail: a.gmail,
        estado: a.estado || null,
        minutosRetraso: a.estado === "Tarde" ? a.minutosRetraso ?? 0 : null,
        horaIngreso: a.estado === "Tarde" ? a.horaIngreso || "" : "",
        observacion: a.observacion || "",
      }));
      let avisos = 0;
      if (CONECTADO_A_DJANGO) {
        const r = await apiPost("/api/asistencia/profesor/guardar/", {
          curso: cursoInfo.curso,
          materia: cursoInfo.materia,
          fecha,
          registros,
        });
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

  if (asignadas.length === 0) {
    return (
      <div>
        <SectionHeading eyebrow={CURRENT_USER.rol} title="Asistencia" />
        <EmptyState icon={ClipboardCheck} title="Todavía no tenés cursos/materias asignadas" />
      </div>
    );
  }

  return (
    <div>
      <SectionHeading eyebrow={CURRENT_USER.rol} title="Asistencia" />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Selector
          label="Curso y materia"
          valorTexto={cursoInfo ? `${cursoInfo.curso} — ${cursoInfo.materia}` : ""}
          onCambiar={setClaveCurso}
          opciones={asignadas.map((c) => ({ key: `${c.curso}||${c.materia}`, titulo: c.curso, subtitulo: c.materia }))}
        />
        <div>
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Fecha de la clase
          </span>
          <DateInput value={fecha} onChange={setFecha} />
        </div>
      </div>

      {mensaje && (
        <p className={`mb-4 rounded-lg px-3 py-2 text-xs ${mensaje.tipo === "ok" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400"}`}>
          {mensaje.texto}
        </p>
      )}

      {cargando ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : alumnos.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title={`No hay alumnos cargados para ${cursoInfo?.curso}`} />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/60">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Marcar la asistencia de la clase del día
              </p>
              <button
                type="button"
                onClick={guardar}
                disabled={guardando || hayCambios === 0}
                className="flex items-center gap-1.5 rounded-lg bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-cyan-800 disabled:opacity-50"
              >
                {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />}
                {guardando ? "Guardando…" : "Guardar asistencia"}
              </button>
            </div>

            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {alumnos.map((a) => (
                <li key={a.gmail} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="scroll-slide text-sm font-semibold text-slate-900 dark:text-slate-100">{a.nombre}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{a.gmail}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(["Presente", "Tarde", "Ausente"]).map((estado) => (
                      <button
                        key={estado}
                        type="button"
                        onClick={() => marcar(a.gmail, estado)}
                        title={`Marcar ${estado}`}
                        className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                          a.estado === estado
                            ? ESTADO_CLASE[estado]
                            : "border-slate-200 text-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-500 dark:hover:bg-slate-800"
                        }`}
                      >
                        {estado === "Presente" ? <Check className="h-4 w-4" /> : estado === "Ausente" ? <X className="h-4 w-4" /> : <ClockIcon />}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>

            <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                ✓ Presente · 🕐 Tarde · ✕ Ausente
              </p>
            </div>
          </div>

          {resumen.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Resumen de asistencia</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Clases dictadas en {cursoInfo?.materia} · 75% mínimo para la regularidad
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Alumno</th>
                      <th className="w-32 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Clases</th>
                      <th className="w-24 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">%</th>
                      <th className="w-48 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.map((r) => {
                      const e = ESTADO_RESUMEN[r.estado] || ESTADO_RESUMEN.sin_datos;
                      return (
                        <tr key={r.gmail} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                          <td className="scroll-slide px-4 py-2.5 text-slate-900 dark:text-slate-100">{r.nombre}</td>
                          <td className="px-2 py-2.5 text-center text-slate-500 dark:text-slate-400">{r.asistidas} / {r.clases}</td>
                          <td className="px-2 py-2.5 text-center font-bold text-slate-900 dark:text-slate-100">
                            {r.porcentaje != null ? `${r.porcentaje}%` : "--"}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${e.fondo} ${e.texto}`}>
                              {e.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <ActasGuardadas curso={cursoInfo?.curso || ""} refrescar={actasRef} />
        </>
      )}
    </div>
  );
}

function ClockIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  );
}
