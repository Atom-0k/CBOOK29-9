import { useState } from "react";
import { MessageCircle, Loader2, Send, ShieldCheck } from "lucide-react";
import { apiPost } from "../admin/adminApi";
import { CONECTADO_A_DJANGO } from "../../data/mock";

/**
 * Permite escribirle a quien envió la nota.
 *
 * Se autoriza con el MISMO PIN con el que el alumno confirma las notas, el que
 * le entregó la institución. Si lo recuerda, escribe y el autor recibe el
 * aviso; si no lo recuerda, esta vía tampoco le sirve y lo que corresponde es
 * pedirle el PIN a la institución.
 *
 * Aparece en cualquier nota que el alumno tenga pendiente de confirmar, haya
 * confirmado o no: escribirle a un docente no es un paso de la confirmación.
 */
export function ResponderNota({ nota, onEnviado }) {
  const [abierto, setAbierto] = useState(false);
  const [pin, setPin] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [listo, setListo] = useState(false);

  if (listo) {
    return (
      <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        <ShieldCheck className="h-3 w-3" /> Le escribiste a {nota.autor}
      </p>
    );
  }

  async function enviar(e) {
    e.preventDefault();
    setError(null);
    if (!pin.trim()) {
      setError("Ingresá tu PIN para enviar el mensaje.");
      return;
    }
    if (!texto.trim()) {
      setError("Escribí tu consulta.");
      return;
    }
    setEnviando(true);
    try {
      if (CONECTADO_A_DJANGO) {
        await apiPost("/api/notas/mensaje/", {
          notaId: nota.id,
          pin: pin.trim(),
          mensaje: texto.trim(),
        });
      }
      setListo(true);
      setPin("");
      setTexto("");
      onEnviado?.();
    } catch (err) {
      setError(err.message || "No se pudo enviar el mensaje.");
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) {
    return (
      <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <MessageCircle className="h-3.5 w-3.5" /> Escribile a {nota.autor}
        </button>
        <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
          Con tu PIN. {nota.autor} recibe un aviso y te puede responder.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\s/g, ""))}
        placeholder="Tu PIN"
        aria-label="Tu PIN, el mismo con el que confirmás las notas"
        className="w-48 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-cyan-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder={`Escribile a ${nota.autor}...`}
        aria-label="Mensaje para quien envió la nota"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-cyan-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={enviando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-cyan-800 disabled:opacity-50"
        >
          {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {enviando ? "Enviando…" : "Enviar mensaje"}
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          Cancelar
        </button>
      </div>
      {error && <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}
      <p className="text-xs text-slate-400 dark:text-slate-500">
        {nota.autor} va a recibir un aviso de que le escribiste.
      </p>
    </form>
  );
}
