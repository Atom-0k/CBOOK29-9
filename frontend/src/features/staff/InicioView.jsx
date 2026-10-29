import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Users,
  Send,
  History,
  CalendarDays,
  CalendarCheck2,
  ClipboardCheck,
  PencilLine,
  Loader2,
} from "lucide-react";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { EmptyState } from "../../components/ui/EmptyState";
import { CURRENT_USER, CURRENT_ASIGNACIONES, CONECTADO_A_DJANGO } from "../../data/mock";

/**
 * Agrupa las asignaciones del usuario por curso y por rol.
 *
 * El caso que motivó esto: un preceptor que además da clases tiene N cursos
 * con materia y M a cargo. Antes la home tomaba una sola asignación (la
 * primera sin materia) y la mostraba como "curso a cargo", haciendo creer
 * que los otros cursos no existían.
 */
function agruparCursos(asignaciones) {
  const aCargo = new Map(); // curso -> asignación sin materia
  const docencia = new Map(); // curso -> Set de materias

  for (const a of asignaciones) {
    if (!a?.curso) continue;
    if (a.materia) {
      if (!docencia.has(a.curso)) docencia.set(a.curso, new Set());
      docencia.get(a.curso).add(a.materia);
    } else {
      if (!aCargo.has(a.curso)) aCargo.set(a.curso, a);
    }
  }
  return { aCargo, docencia };
}

function TarjetaCurso({ curso, detalle, children }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="min-w-0">
        <p className="truncate text-lg font-bold text-slate-900 dark:text-slate-100">{curso}</p>
        {detalle && <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{detalle}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function BotonAccion({ onClick, icon: Icon, children, destacado }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${
        destacado
          ? "bg-cyan-800 text-white hover:bg-cyan-900 dark:bg-cyan-600 dark:hover:bg-cyan-500"
          : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function SeccionCursos({ titulo, descripcion, cursos, renderAcciones }) {
  if (cursos.length === 0) return null;
  return (
    <section>
      <div className="mb-2.5">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{titulo}</h2>
        {descripcion && <p className="text-xs text-slate-500 dark:text-slate-400">{descripcion}</p>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cursos.map((c) => (
          <TarjetaCurso key={`${titulo}-${c.curso}`} curso={c.curso} detalle={c.detalle}>
            {renderAcciones(c)}
          </TarjetaCurso>
        ))}
      </div>
    </section>
  );
}

export function InicioView({ onIrA }) {
  const esProfesor = CURRENT_USER.roles.includes("Profesor");
  const esPreceptor = CURRENT_USER.roles.includes("Preceptor");
  const [notasEnviadas, setNotasEnviadas] = useState(null);
  const [cargandoNotas, setCargandoNotas] = useState(CONECTADO_A_DJANGO);

  const { aCargo, docencia } = useMemo(() => agruparCursos(CURRENT_ASIGNACIONES), []);

  // El contador antes salía del mock: en producción mostraba un número falso.
  useEffect(() => {
    if (!CONECTADO_A_DJANGO) {
      setCargandoNotas(false);
      return;
    }
    let vivo = true;
    fetch("/api/notas/enviadas/", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { notas: [] }))
      .then((data) => {
        if (vivo) setNotasEnviadas((data.notas || []).length);
      })
      .catch(() => {
        if (vivo) setNotasEnviadas(null);
      })
      .finally(() => {
        if (vivo) setCargandoNotas(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  // Un mismo curso puede aparecer en los dos grupos (p. ej. es preceptor de
  // 6B y además da Educación Física en 6B). Se lista en ambos porque los
  // permisos difieren, y se aclara en la tarjeta para que no parezca un error.
  const cursosACargo = useMemo(
    () =>
      [...aCargo.entries()].map(([curso, asignacion]) => ({
        curso,
        asignacion,
        detalle: docencia.has(curso) ? `También das clase: ${[...docencia.get(curso)].join(" · ")}` : null,
      })),
    [aCargo, docencia],
  );
  const cursosDocencia = useMemo(
    () =>
      [...docencia.entries()].map(([curso, materias]) => ({
        curso,
        detalle: [...materias].join(" · "),
      })),
    [docencia],
  );


  const totalCursos = new Set([...aCargo.keys(), ...docencia.keys()]).size;
  const nombre = (CURRENT_USER.nombre || "").split(" ")[0];
  const sinCursos = totalCursos === 0;

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow={CURRENT_USER.rol}
        title={nombre ? `Hola, ${nombre}` : "Inicio"}
        action={
          <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-bold text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300">
            {totalCursos} {totalCursos === 1 ? "curso" : "cursos"}
          </span>
        }
      />

      {sinCursos ? (
        <EmptyState
          icon={Users}
          title="No tenés cursos asignados"
          description="Pedile a Dirección que revise tus asignaciones de curso y materia."
        />
      ) : (
        <>
          <SeccionCursos
            titulo="Cursos a cargo"
            descripcion="Sos preceptor: tomás la asistencia institucional del turno, editás horarios y mandás notas a todo el curso."
            cursos={cursosACargo}
            renderAcciones={(c) => (
              <>
                <BotonAccion
                  destacado
                  onClick={() => onIrA("asistencia", { curso: c.curso, tipo: "institucional" })}
                  icon={CalendarCheck2}
                >
                  Asistencia
                </BotonAccion>
                <BotonAccion onClick={() => onIrA("editar_horarios", { curso: c.curso })} icon={PencilLine}>
                  Horarios
                </BotonAccion>
                <BotonAccion onClick={() => onIrA("enviar", { curso: c.curso })} icon={Send}>
                  Enviar nota
                </BotonAccion>
              </>
            )}
          />

          <SeccionCursos
            titulo="Cursos donde doy clase"
            descripcion="Como profesor cargás calificaciones, tomás asistencia por materia y mandás notas."
            cursos={cursosDocencia}
            renderAcciones={(c) => (
              <>
                <BotonAccion destacado onClick={() => onIrA("calificaciones_prof", { curso: c.curso })} icon={ClipboardCheck}>
                  Calificaciones
                </BotonAccion>
                <BotonAccion
                  onClick={() =>
                    onIrA("asistencia", {
                      curso: c.curso,
                      tipo: aCargo.has(c.curso) ? "institucional" : "materia",
                    })
                  }
                  icon={CalendarCheck2}
                >
                  Asistencia
                </BotonAccion>
                <BotonAccion onClick={() => onIrA("enviar", { curso: c.curso })} icon={Send}>
                  Enviar nota
                </BotonAccion>
              </>
            )}
          />
        </>
      )}

      <section>
        <h2 className="mb-2.5 text-sm font-bold text-slate-900 dark:text-slate-100">Acciones rápidas</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => onIrA("enviar")}
            className="flex items-center gap-3 rounded-xl bg-gradient-to-br from-cyan-800 to-cyan-900 p-4 text-left text-white shadow-sm transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white dark:from-cyan-700 dark:to-cyan-900"
          >
            <Send className="h-5 w-5 shrink-0 text-cyan-200" />
            <span>
              <span className="block text-sm font-semibold">Enviar nota</span>
              <span className="block text-xs text-cyan-100">A uno, varios o todo el curso</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => onIrA("historial")}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            <History className="h-5 w-5 shrink-0 text-cyan-600 dark:text-cyan-400" />
            <span>
              <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                Historial de notas
              </span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                {cargandoNotas ? (
                  <Loader2 className="inline h-3 w-3 animate-spin" />
                ) : notasEnviadas === null ? (
                  "Notas que mandaste"
                ) : (
                  `${notasEnviadas} ${notasEnviadas === 1 ? "nota enviada" : "notas enviadas"}`
                )}
              </span>
            </span>
          </button>

          {esProfesor && (
            <button
              type="button"
              onClick={() => onIrA("calificaciones_prof")}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              <BookOpen className="h-5 w-5 shrink-0 text-cyan-600 dark:text-cyan-400" />
              <span>
                <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Calificaciones
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {cursosDocencia.length} {cursosDocencia.length === 1 ? "curso" : "cursos"}
                </span>
              </span>
            </button>
          )}

          {esPreceptor && (
            <button
              type="button"
              onClick={() => onIrA("asistencia")}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              <CalendarDays className="h-5 w-5 shrink-0 text-cyan-600 dark:text-cyan-400" />
              <span>
                <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">Asistencia</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {cursosACargo.length} {cursosACargo.length === 1 ? "curso" : "cursos"} a cargo
                </span>
              </span>
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
