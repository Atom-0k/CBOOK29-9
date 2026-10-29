import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Loader2, Send, Inbox } from "lucide-react";
import { SectionHeading } from "../ui/SectionHeading";
import { EmptyState } from "../ui/EmptyState";
import { formatFecha } from "../../utils/date";
import { CONECTADO_A_DJANGO } from "../../data/mock";
import { apiGet, apiPost } from "../admin/adminApi";

/**
 * Bandeja del alumno: los mensajes que le escribió a alguien y lo que le
 * contestó. Es su lado del hilo de "me devolvieron el PIN".
 *
 * El alumno nunca ve el PIN ni si el mensaje propio pasó por el PIN: eso sólo
 * lo ve quien envió la nota, y el servidor lo decide (ver notas_respuesta.py).
 */
export function MisMensajes({ recargarClave = 0 }) {
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
  }, [cargar, recargarClave]);

  async function responder(e) {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    setError(null);
    try {
      await apiPost("/api/notas/mensaje/responder/", {
        mensajeId: respondiendo,
        texto: texto.trim(),
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

  return (
    <section className="mt-6">
      <SectionHeading eyebrow="Consultas" title="Mensajes que enviaste" />
      {!mensajes ? (
        <p className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
        </p>
      ) : mensajes.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Todavía no le escribiste a nadie"
          description="Si una nota te pide un PIN que no tenés, podés pedirlo desde la nota."
        />
      ) : (
        <div className="space-y-3">
          {mensajes.map((m) => (
            <article
              key={m.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-center gap-2">
                <MessageCircle className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {m.notaTitulo || "Nota"}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {formatFecha(m.creado)}
                </span>
                {m.estado === "respondida" && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    Te respondieron
                  </span>
                )}
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">
                {m.mensaje}
              </p>

              {m.respuesta ? (
                <div className="mt-3 rounded-lg border-l-2 border-cyan-500 bg-slate-50 p-3 dark:bg-slate-800/60">
                  <p className="text-[11px] font-semibold text-cyan-700 dark:text-cyan-300">
                    {m.respuesta.autor} · {formatFecha(m.respuesta.fecha)}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">
                    {m.respuesta.texto}
                  </p>
                </div>
              ) : respondiendo === m.id ? (
                <form onSubmit={responder} className="mt-3 space-y-2">
                  <textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    rows={2}
                    maxLength={1000}
                    autoFocus
                    placeholder="Escribí tu respuesta..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-cyan-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={enviando}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
                    >
                      {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      {enviando ? "Enviando…" : "Responder"}
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
                  Responder de nuevo
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
