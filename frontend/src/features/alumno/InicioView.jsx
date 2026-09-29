import { Bell, ClipboardList, FileText } from "lucide-react";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { EmptyState } from "../../components/ui/EmptyState";
import { NoteCard, NoteCardSkeleton } from "../../components/ui/NoteCard";
import { Skeleton } from "../../components/ui/Skeleton";
import { useMockLoading } from "../../hooks/useMockLoading";
import { CURRENT_USER } from "../../data/mock";
import { formatFecha } from "../../utils/date";

export function InicioView({ notas, onIrANotas, onConfirmar }) {
  const loading = useMockLoading([], 500);
  const sinLeer = notas.filter((n) => !n.leida);
  const proximaCitacion = notas.find((n) => n.tipo === "citacion");

  return (
    <div>
      <SectionHeading eyebrow={CURRENT_USER.curso} title={`Hola, ${CURRENT_USER.nombre.split(" ")[0]}`} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-gradient-to-br from-cyan-800 to-cyan-900 p-5 text-white shadow-sm dark:from-cyan-700 dark:to-cyan-900">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-cyan-100">Notas sin leer</p>
            <Bell className="h-4 w-4 text-cyan-200" aria-hidden="true" />
          </div>
          <p className="mt-2 text-3xl font-bold">{loading ? "—" : sinLeer.length}</p>
          <button onClick={onIrANotas} className="mt-3 rounded-md text-xs font-semibold text-cyan-100 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
            Ver todas
          </button>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Próxima citación</p>
            <ClipboardList className="h-4 w-4 text-amber-500" aria-hidden="true" />
          </div>
          {loading ? (
            <Skeleton className="mt-3 h-5 w-2/3" />
          ) : proximaCitacion ? (
            <>
              <p className="scroll-slide mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{proximaCitacion.titulo}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatFecha(proximaCitacion.fecha)}</p>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">No tenés citaciones pendientes</p>
          )}
        </div>
      </div>
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Últimas comunicaciones</h2>
          <button onClick={onIrANotas} className="rounded-md px-2 py-1 text-xs font-medium text-cyan-700 hover:bg-cyan-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 dark:text-cyan-400 dark:hover:bg-cyan-500/10">
            Ver todas
          </button>
        </div>
        {loading ? (
          <div className="space-y-3"><NoteCardSkeleton /><NoteCardSkeleton /></div>
        ) : notas.length === 0 ? (
          <EmptyState icon={FileText} title="No tenés notas nuevas" />
        ) : (
          <div className="space-y-3">{notas.slice(0, 3).map((n) => <NoteCard key={n.id} nota={n} onConfirmar={onConfirmar} />)}</div>
        )}
      </div>
    </div>
  );
}
