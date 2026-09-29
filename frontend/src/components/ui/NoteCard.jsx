import { useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { TIPO_NOTA } from "../../config/tipoNota";
import { formatFecha } from "../../utils/date";
import { ResponderNota } from "../forms/ResponderNota";
import { Skeleton } from "./Skeleton";

export function NoteCard({ nota, onConfirmar, allowConfirm = true, onRespondido }) {
  const meta = TIPO_NOTA[nota.tipo];
  const Icon = meta.icon;
  const requiereConfirmacion = allowConfirm && nota.requierePin && !nota.confirmada;
  // Sólo tiene sentido responder si la nota pide PIN para confirmarse y todavía
  // no se confirmó: es exactamente el caso de "no puedo firmarla".
  const puedeResponder = allowConfirm;
  const [mostrarPin, setMostrarPin] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState(null);

  async function confirmar(e) {
    e.preventDefault();
    setError(null);
    if (!pin.trim()) {
      setError("Ingresá el PIN");
      return;
    }
    setConfirmando(true);
    try {
      if (onConfirmar) await onConfirmar(nota.id, pin.trim());
      setPin("");
      setMostrarPin(false);
    } catch (err) {
      setError(err.message || "No se pudo confirmar la nota.");
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <article
      className={`relative flex gap-3 rounded-xl border-l-4 bg-white p-4 shadow-sm ring-1 ring-slate-200 transition-shadow duration-200 hover:shadow-md dark:bg-slate-900 dark:ring-slate-800 ${meta.border}`}
    >
      {!nota.leida && (
        <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-cyan-600 dark:bg-cyan-400" title="No leída" />
      )}
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.bg}`}>
        <Icon className={`h-4.5 w-4.5 ${meta.text}`} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.bg} ${meta.text}`}>
            {meta.label}
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500">{formatFecha(nota.fecha)}</span>
        </div>
        <h3 className="scroll-slide mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{nota.titulo}</h3>
        <p className="mt-0.5 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">{nota.contenido}</p>
        <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">{nota.autor}</p>

        {nota.confirmada && (
          <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            <ShieldCheck className="h-3 w-3" /> Confirmada con PIN
          </p>
        )}

        {requiereConfirmacion && (
          <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            {!mostrarPin ? (
              <button
                onClick={() => setMostrarPin(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-cyan-800"
              >
                <ShieldCheck className="h-3.5 w-3.5" /> Confirmar nota
              </button>
            ) : (
              <form onSubmit={confirmar} className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="Ingresá tu PIN"
                  className="w-40 rounded-lg border border-slate-300 px-2 py-1.5 text-center text-xs tracking-widest text-slate-900 focus:border-cyan-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <button
                  type="submit"
                  disabled={confirmando}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-cyan-800 disabled:opacity-50"
                >
                  {confirmando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {confirmando ? "Confirmando…" : "Confirmar"}
                </button>
              </form>
            )}
            {error && <p className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}
          </div>
        )}

        {puedeResponder && <ResponderNota nota={nota} onEnviado={onRespondido} />}
      </div>
    </article>
  );
}

export function NoteCardSkeleton() {
  return (
    <div className="flex gap-3 rounded-xl border-l-4 border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:ring-slate-800">
      <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  );
}
