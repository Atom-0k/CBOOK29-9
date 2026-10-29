import { useState, useMemo } from "react";
import { Filter } from "lucide-react";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { EmptyState } from "../../components/ui/EmptyState";
import { NoteCard, NoteCardSkeleton } from "../../components/ui/NoteCard";
import { MisMensajes } from "../../components/forms/MisMensajes";
import { useMockLoading } from "../../hooks/useMockLoading";
import { TIPO_NOTA } from "../../config/tipoNota";

export function NotasView({ notas, onConfirmar }) {
  const [filtro, setFiltro] = useState("todas");
  // Se incrementa al mandar un mensaje, para que la bandeja de abajo se
  // vuelva a consultar sin recargar la página.
  const [recargaMensajes, setRecargaMensajes] = useState(0);
  const loading = useMockLoading([filtro], 450);

  const notasFiltradas = useMemo(() => {
    if (filtro === "todas") return notas;
    return notas.filter((n) => n.tipo === filtro);
  }, [notas, filtro]);

  const filtros = [{ id: "todas", label: "Todas" }, ...Object.entries(TIPO_NOTA).map(([id, v]) => ({ id, label: v.label }))];

  return (
    <div>
      <SectionHeading eyebrow="Comunicaciones" title="Mis Notas" />
      <div role="tablist" className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {filtros.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filtro === f.id}
            onClick={() => setFiltro(f.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${
              filtro === f.id
                ? "bg-cyan-800 text-white dark:bg-cyan-600"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-700 dark:hover:bg-slate-800"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="space-y-3"><NoteCardSkeleton /><NoteCardSkeleton /><NoteCardSkeleton /></div>
      ) : notasFiltradas.length === 0 ? (
        <EmptyState icon={Filter} title="No hay notas para este filtro" />
      ) : (
        <div className="space-y-3">
          {notasFiltradas.map((n) => (
            <NoteCard
              key={n.id}
              nota={n}
              onConfirmar={onConfirmar}
              onRespondido={() => setRecargaMensajes((v) => v + 1)}
            />
          ))}
        </div>
      )}

      <MisMensajes recargarClave={recargaMensajes} />
    </div>
  );
}
