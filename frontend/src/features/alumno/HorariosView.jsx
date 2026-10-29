import { CalendarX } from "lucide-react";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { useMockLoading } from "../../hooks/useMockLoading";
import { CURRENT_HORARIO, CURRENT_USER } from "../../data/mock";

const DIAS_ORDEN = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes"];

export function HorariosView() {
  const loading = useMockLoading([], 500);
  const hayHorario = DIAS_ORDEN.some((d) => (CURRENT_HORARIO[d] || []).length > 0);

  return (
    <div>
      <SectionHeading eyebrow={CURRENT_USER.curso} title="Horarios" />
      {loading ? (
        <div className="space-y-4">{DIAS_ORDEN.map((d) => <Skeleton key={d} className="h-28 w-full rounded-xl" />)}</div>
      ) : !hayHorario ? (
        <EmptyState icon={CalendarX} title="Todavía no hay horario cargado" />
      ) : (
        <div className="space-y-4">
          {DIAS_ORDEN.map((dia) => {
            const clases = CURRENT_HORARIO[dia];
            if (!clases || clases.length === 0) return null;
            return (
              <div key={dia} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{dia}</h3>
                </div>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {clases.map((c, i) => (
                    <li key={i} className="flex items-center gap-3 px-4 py-3">
                      <span className="w-24 shrink-0 text-xs font-medium text-slate-400 dark:text-slate-500">{c.Inicio} - {c.Fin}</span>
                      <div className="min-w-0 flex-1">
                        <p className="scroll-slide text-sm font-medium text-cyan-800 dark:text-cyan-400">{c.Materia}</p>
                        <p className="scroll-slide text-xs text-slate-500 dark:text-slate-400">{c.Profesor}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
