import { useEffect, useState } from "react";
import { ClipboardCheck, Loader2, AlertTriangle, CheckCircle2, Clock, CalendarCheck2, FileText } from "lucide-react";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { CURRENT_USER, CONECTADO_A_DJANGO } from "../../data/mock";
import { apiGet, formatearFecha } from "../../components/admin/adminApi";

const ESTADOS_MATERIA = {
  cumple: { label: "Cumple", dot: "🟢", texto: "text-emerald-700 dark:text-emerald-400", fondo: "bg-emerald-50 dark:bg-emerald-500/10" },
  cerca: { label: "Cerca del mínimo", dot: "🟡", texto: "text-amber-700 dark:text-amber-400", fondo: "bg-amber-50 dark:bg-amber-500/10" },
  no_cumple: { label: "Requiere intensificación", dot: "🔴", texto: "text-rose-700 dark:text-rose-400", fondo: "bg-rose-50 dark:bg-rose-500/10" },
  sin_datos: { label: "Sin clases registradas", dot: "⚪", texto: "text-slate-500 dark:text-slate-400", fondo: "bg-slate-50 dark:bg-slate-800" },
};

const ETIQUETA_ESTADO = {
  Presente: "Presente",
  Ausente: "Ausente",
  Tarde: "Tarde",
};

function ColorEstado({ estado }) {
  const e = ESTADOS_MATERIA[estado] || ESTADOS_MATERIA.sin_datos;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${e.fondo} ${e.texto}`}>
      <span aria-hidden="true">{e.dot}</span>
      {e.label}
    </span>
  );
}

function JustificacionMini({ justificacion }) {
  if (!justificacion) return null;
  const estado = justificacion.estado;
  const color =
    estado === "Justificada"
      ? "text-emerald-700 dark:text-emerald-400"
      : estado === "Rechazada"
        ? "text-rose-700 dark:text-rose-400"
        : "text-amber-700 dark:text-amber-400";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${color}`}>
      <FileText className="h-3 w-3" aria-hidden="true" />
      {estado === "Justificada" ? "Justificada" : estado === "Rechazada" ? "Rechazada" : "Justificación pendiente"}
    </span>
  );
}

const MOCK_ASISTENCIA_ALUMNO = {
  inasistencias: 5,
  limite: 28,
  supero_limite: false,
  restan: 23,
  turno: "Mañana",
  por_materia: [
    { materia: "Análisis Matemático", clases: 12, asistidas: 11, porcentaje: 91.7, estado: "cumple", requiere_intensificacion: false },
    { materia: "Taller de Mecanizado", clases: 9, asistidas: 6, porcentaje: 66.7, estado: "no_cumple", requiere_intensificacion: true },
    { materia: "Sistemas de Control", clases: 8, asistidas: 8, porcentaje: 100, estado: "cumple", requiere_intensificacion: false },
  ],
  historial: [
    { fecha: "2026-08-12", turno: "mañana", estado: "Tarde", tipo: "institucional", materia: "", minutosRetraso: 12, horaIngreso: "07:42", observacion: "", justificacion: null },
    { fecha: "2026-08-11", turno: "mañana", estado: "Ausente", tipo: "institucional", materia: "", minutosRetraso: null, horaIngreso: "", observacion: "Presentó certificado luego", justificacion: { estado: "Justificada", tipo: "certificado" } },
    { fecha: "2026-08-08", turno: "mañana", estado: "Presente", tipo: "materia", materia: "Análisis Matemático", minutosRetraso: null, horaIngreso: "", observacion: "", justificacion: null },
  ],
};

export function AsistenciaView() {
  const alumnoGmail = CURRENT_USER.gmail || "";
  const [datos, setDatos] = useState(CONECTADO_A_DJANGO ? null : MOCK_ASISTENCIA_ALUMNO);
  const [cargando, setCargando] = useState(CONECTADO_A_DJANGO);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!CONECTADO_A_DJANGO) return;
    const params = new URLSearchParams();
    if (alumnoGmail) params.set("gmail", alumnoGmail);
    setCargando(true);
    setError(null);
    apiGet(`/api/asistencia/alumno/?${params}`)
      .then((d) => setDatos(d))
      .catch((e) => setError(e.message || "No se pudo cargar la asistencia."))
      .finally(() => setCargando(false));
  }, [alumnoGmail]);

  if (cargando) {
    return (
      <div>
        <SectionHeading eyebrow={CURRENT_USER.curso} title="Mi Asistencia" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <div className="mt-4 space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <SectionHeading eyebrow={CURRENT_USER.curso} title="Mi Asistencia" />
        <EmptyState icon={AlertTriangle} title="No se pudo cargar la asistencia" description={error} />
      </div>
    );
  }

  if (!datos) return null;

  const limite = datos.limite || 28;
  const total = datos.inasistencias || 0;
  const supero = !!datos.supero_limite;
  const restan = datos.restan ?? limite - total;
  const pctBarra = Math.min(100, (total / limite) * 100);
  const porMateria = datos.por_materia || [];
  const historial = datos.historial || [];

  return (
    <div>
      <SectionHeading eyebrow={CURRENT_USER.curso} title="Mi Asistencia" />

      {/* Límite institucional */}
      <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Inasistencias institucionales {new Date().getFullYear()}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Límite anual: {limite} · Turno: {datos.turno || "Mañana"}
            </p>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-slate-100">
            {total}
            <span className="text-base font-semibold text-slate-400 dark:text-slate-500"> / {limite}</span>
          </p>
        </div>
        <div className="px-4 py-3">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${supero ? "bg-rose-600" : pctBarra >= 80 ? "bg-amber-500" : "bg-emerald-500"}`}
              style={{ width: `${pctBarra}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {supero ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                Límite institucional superado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Te quedan {restan} inasistencia{restan === 1 ? "" : "s"}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <CalendarCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
              Las faltas justificadas no se descuentan del límite
            </span>
          </div>
          {supero && (
            <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
              De todas formas, debés continuar asistiendo normalmente.
            </p>
          )}
        </div>
      </div>

      {/* Asistencia por materia */}
      <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Asistencia por materia</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Se toma sobre las clases efectivamente dictadas (75% mínimo para la regularidad)
          </p>
        </div>
        {porMateria.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="Todavía no hay registros por materia" description="Cuando tus profesores carguen asistencia, la vas a ver acá." />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {porMateria.map((m) => (
              <li key={m.materia} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="scroll-slide text-sm font-semibold text-slate-900 dark:text-slate-100">{m.materia}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {m.asistidas} de {m.clases} clases
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {m.porcentaje != null ? `${m.porcentaje}%` : "--"}
                  </span>
                  <ColorEstado estado={m.estado} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Historial */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Historial</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500">Todas tus registros de asistencia del año lectivo</p>
        </div>
        {historial.length === 0 ? (
          <EmptyState icon={CalendarCheck2} title="Todavía no hay registros de asistencia" />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {historial.map((h, i) => (
              <li key={`${h.fecha}-${h.turno}-${i}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {formatearFecha(h.fecha)}
                    {h.materia ? (
                      <span className="ml-2 text-xs font-medium text-cyan-700 dark:text-cyan-400">{h.materia}</span>
                    ) : (
                      <span className="ml-2 text-xs font-medium text-slate-400 dark:text-slate-500">
                        {h.turno ? `${h.turno.charAt(0).toUpperCase()}${h.turno.slice(1)}` : "Institucional"}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {h.tipo === "materia" ? "Por materia" : "Institucional"}
                    {h.horaIngreso ? ` · Entrada ${h.horaIngreso}` : ""}
                    {h.observacion ? ` · ${h.observacion}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {h.minutosRetraso != null && (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      {h.minutosRetraso}'
                    </span>
                  )}
                  <JustificacionMini justificacion={h.justificacion} />
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                      h.estado === "Presente"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                        : h.estado === "Tarde"
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                          : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400"
                    }`}
                  >
                    {ETIQUETA_ESTADO[h.estado] || h.estado}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
