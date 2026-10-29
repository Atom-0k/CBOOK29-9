import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Loader2, Send, Check, ShieldCheck } from "lucide-react";
import { SectionHeading } from "../ui/SectionHeading";
import { EmptyState } from "../ui/EmptyState";
import { formatFecha } from "../../utils/date";
import { CONECTADO_A_DJANGO } from "../../data/mock";
import { apiGet, apiPost } from "../admin/adminApi";

/**
 * Bandeja del docente: lo que le respondieron sobre las notas que envió.
 *
 * Sólo aparecen mensajes de notas que él escribió: la autorización la hace el
 * servidor contra el AutorGmail de la nota del mensaje, no contra un campo del
 * mensaje (ver notas_respuesta.api_responder_mensaje).
 */
export function BandejaMensajes() {
  const [mensajes, setMensajes] = useState(null);
  const [respondiendo, setRespondiendo] = useState(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const cargar = useCallback(() => {
    if (!CONECTADO_A_DJANGO) {
      setMensajes([]);
      return;
    }
    apiGet("/api/notas/mensajes/")
      .then((d) => setMensajes(d.mensajes || []))
      .catch(() => setMensajes([]));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function responder(e, cerrar) {
    e.preventDefault();
    if (!texto.trim() && !cerrar) return;
    setEnviando(true);
    setError(null);
    try {
      await apiPost("/api/notas/mensaje/responder/", {
        mensajeId: respondiendo,
        texto: texto.trim(),
        cerrar,
      });
      setRespondiendo(null);
      setTexto("");
      cargar();
    } catch (err) {
      setError(err.message || "No se pudo enviar.");
    } finally {
      setEnviando(false);
    }
  }

  if (mensajes !== null && mensajes.length === 0) return null;

  const pendientes = (mensajes || []).filter((m) => m.estado === "pendiente").length;

  return (
    <section className="mt-6">
      <SectionHeading
        eyebrow="Consultas de los alumnos"
        title="Te escribieron"
        action={
          pendientes > 0 ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
              {pendientes} sin responder
            </span>
          ) : null
        }
      />
      {!mensajes ? (
        <p className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
        </p>
      ) : mensajes.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="Nadie te escribió por una nota"
          description="Cuando un alumno te escriba, el aviso te llega también por correo."
        />
      ) : (
        <div className="space-y-3">
          {mensajes.map((m) => (
            <article
              key={m.id}
              className={`rounded-xl border bg-white p-4 shadow-sm dark:bg-slate-900 ${
                m.estado === "pendiente"
                  ? "border-amber-300 dark:border-amber-500/40"
                  : "border-slate-200 dark:border-slate-800"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {m.emisor}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {m.curso}
                </span>
                {m.pinVerificado && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    <ShieldCheck className="h-3 w-3" /> Verificó el PIN
                  </span>
                )}
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {formatFecha(m.creado)}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                sobre: {m.notaTitulo || "nota"}
              </p>
              <p className="mt-2 whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">
                {m.mensaje}
              </p>

              {m.respuesta ? (
                <div className="mt-3 rounded-lg border-l-2 border-emerald-500 bg-slate-50 p-3 dark:bg-slate-800/60">
                  <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    Le respondiste · {formatFecha(m.respuesta.fecha)}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">
                    {m.respuesta.texto}
                  </p>
                </div>
              ) : respondiendo === m.id ? (
                <form onSubmit={(e) => responder(e, false)} className="mt-3 space-y-2">
                  <textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    rows={2}
                    maxLength={1000}
                    autoFocus
                    placeholder="Escribile una respuesta (por ejemplo, el PIN)..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-cyan-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="submit"
                      disabled={enviando || !texto.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
                    >
                      {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Responder
                    </button>
                    <button
                      type="button"
                      disabled={enviando}
                      onClick={(e) => responder(e, true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <Check className="h-3.5 w-3.5" /> Cerrar sin responder
                    </button>
                    <button
                      type="button"
                      onClick={() => setRespondiendo(null)}
                      className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400"
                    >
                      Cancelar
                    </button>
                  </div>
                  {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setRespondiendo(m.id);
                    setTexto("");
                    setError(null);
                  }}
                  className="mt-2 text-xs font-semibold text-cyan-700 hover:underline dark:text-cyan-400"
                >
                  Responder
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
