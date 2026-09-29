import { useState, useEffect, useMemo } from "react";
import { History, ShieldCheck, ShieldAlert, Pencil, Users, Loader2 } from "lucide-react";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { EmptyState } from "../../components/ui/EmptyState";
import { NoteCard, NoteCardSkeleton } from "../../components/ui/NoteCard";
import { BandejaMensajes } from "../../components/forms/BandejaMensajes";
import { Modal } from "../../components/admin/Modal";
import { getCsrfToken } from "../../utils/csrf";
import { CURRENT_USER, CONECTADO_A_DJANGO, MOCK_NOTAS_ENVIADAS } from "../../data/mock";

function EstadoFirmas({ nota }) {
  if (!nota.requierePin) return null;

  const tieneDetalle =
    nota.cantidadAlumnos ||
    (Array.isArray(nota.firmados) && nota.firmados.length) ||
    (Array.isArray(nota.sinFirmar) && nota.sinFirmar.length);

  // Nota individual sin el detalle por alumno: se muestra el estado simple.
  if (!tieneDetalle) {
    return (
      <p
        className={`mt-1.5 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${
          nota.confirmada
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
            : "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
        }`}
      >
        {nota.confirmada ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
        {nota.confirmada ? "Confirmada por el alumno" : "Esperando confirmación del alumno"}
      </p>
    );
  }

  if (nota.todosFirmaron || (nota.sinFirmar?.length === 0 && nota.firmados?.length > 0)) {
    return (
      <p className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        <ShieldCheck className="h-3 w-3" /> Firmaron todos los alumnos ({nota.firmados?.length || nota.cantidadAlumnos || 0})
      </p>
    );
  }

  const total = nota.cantidadAlumnos || (nota.firmados?.length || 0) + (nota.sinFirmar?.length || 0);
  return (
    <div className="mt-2 space-y-1.5 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
      <p className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300">
        <ShieldAlert className="h-3.5 w-3.5" />
        Firmaron {nota.firmados?.length || 0} de {total} alumnos
      </p>
      {nota.firmados?.length > 0 && (
        <p className="text-emerald-700 dark:text-emerald-300">
          Firmaron: <span className="font-medium">{nota.firmados.join(", ")}</span>
        </p>
      )}
      {nota.sinFirmar?.length > 0 && (
        <p className="text-amber-600 dark:text-amber-400">
          No firmaron: <span className="font-medium">{nota.sinFirmar.join(", ")}</span>
        </p>
      )}
    </div>
  );
}

/** Nombres de los destinatarios, con desplegable si son muchos. */
function Destinatarios({ nota }) {
  const [abierto, setAbierto] = useState(false);
  // Las notas viejas (o el modo mock) no traen la lista: se usa el texto.
  const lista = nota.destinatarios?.length ? nota.destinatarios : [nota.destino].filter(Boolean);
  if (lista.length === 0) return null;
  if (lista.length <= 3) {
    return <span>{lista.join(", ")}</span>;
  }
  return (
    <span>
      {abierto ? lista.join(", ") : `${lista.slice(0, 3).join(", ")} y ${lista.length - 3} más`}
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        className="ml-1.5 font-semibold text-cyan-700 underline-offset-2 hover:underline dark:text-cyan-400"
      >
        {abierto ? "ver menos" : "ver todos"}
      </button>
    </span>
  );
}

/** Editor del texto de una nota propia que todavía no firmó nadie. */
function EditarNotaModal({ nota, onCerrar, onGuardado }) {
  const [titulo, setTitulo] = useState(nota?.titulo || "");
  const [contenido, setContenido] = useState(nota?.contenido || "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  if (!nota) return null;

  async function guardar() {
    if (!titulo.trim() || !contenido.trim()) {
      setError("El título y el contenido no pueden quedar vacíos.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const resp = await fetch("/api/notas/editar/", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
        body: JSON.stringify({ id: nota.id, titulo, contenido }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "No se pudo editar la nota.");
      onGuardado(data);
    } catch (err) {
      setError(err.message || "Ocurrió un error.");
    } finally {
      setGuardando(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-cyan-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";

  return (
    <Modal
      open={!!nota}
      onClose={() => !guardando && onCerrar()}
      title="Editar nota"
      subtitle={
        nota.cantidadAlumnos > 1
          ? `La corrigen una sola vez y la ven los ${nota.cantidadAlumnos} alumnos destinatarios.`
          : "La corrigen una sola vez y la ven los destinatarios."
      }
      footer={
        <>
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-800 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-900 disabled:opacity-60 dark:bg-cyan-600 dark:hover:bg-cyan-500"
          >
            {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Guardar cambios
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Título</label>
          <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inputClass} maxLength={200} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Contenido</label>
          <textarea value={contenido} onChange={(e) => setContenido(e.target.value)} rows={6} className={inputClass} maxLength={5000} />
        </div>
        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

export function HistorialNotasView() {
  const [notas, setNotas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    if (!CONECTADO_A_DJANGO) {
      setNotas(MOCK_NOTAS_ENVIADAS);
      return;
    }
    setCargando(true);
    fetch("/api/notas/enviadas/", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => setNotas(data.notas || []))
      .catch(() => setNotas([]))
      .finally(() => setCargando(false));
  }, []);

  const notasOrdenadas = useMemo(() => {
    return [...notas].sort((a, b) => {
      const fa = a.fecha || "";
      const fb = b.fecha || "";
      return fb.localeCompare(fa);
    });
  }, [notas]);

  // Sólo se puede editar mientras nadie firmó: en cuanto un alumno confirmó
  // con su PIN que leyó un texto, ese texto ya no puede ser otro.
  function sePuedeEditar(n) {
    return n.requierePin ? !n.firmados?.length : true;
  }

  function guardarEdicion(data) {
    setNotas((prev) =>
      prev.map((n) =>
        n.id === editando.id
          ? { ...n, titulo: data.titulo ?? n.titulo, contenido: data.contenido ?? n.contenido, editada: true }
          : n,
      ),
    );
    setEditando(null);
    setMensaje({ tipo: "ok", texto: "Nota corregida. Los alumnos ven la versión nueva." });
  }

  return (
    <div>
      <SectionHeading eyebrow={CURRENT_USER.rol} title="Historial de Notas" />
      {cargando ? (
        <div className="space-y-3">
          <NoteCardSkeleton />
          <NoteCardSkeleton />
          <NoteCardSkeleton />
        </div>
      ) : notasOrdenadas.length === 0 ? (
        <EmptyState icon={History} title="Todavía no enviaste ninguna nota" />
      ) : (
        <div className="space-y-3">
          {mensaje && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
              {mensaje.texto}
            </p>
          )}
          {notasOrdenadas.map((n) => (
            <div key={n.id}>
              <NoteCard nota={n} allowConfirm={false} />
              <div className="mt-1 flex flex-wrap items-center justify-between gap-1 pl-1">
                <p className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                  {n.cantidadAlumnos > 1 && <Users className="h-3 w-3" aria-hidden="true" />}
                  <span>Para: </span>
                  <Destinatarios nota={n} />
                  {n.editada && (
                    <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      editada
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  {sePuedeEditar(n) && CONECTADO_A_DJANGO && (
                    <button
                      type="button"
                      onClick={() => setEditando(n)}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-cyan-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-cyan-400"
                    >
                      <Pencil className="h-3 w-3" /> Editar
                    </button>
                  )}
                  {n.requierePin && n.cantidadAlumnos <= 1 && (
                    <span
                      className={`text-xs font-medium ${
                        n.confirmada
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {n.confirmada ? "Confirmada por el alumno" : "Esperando confirmación del alumno"}
                    </span>
                  )}
                </div>
              </div>
              <EstadoFirmas nota={n} />
            </div>
          ))}
        </div>
      )}
      <BandejaMensajes />
      <EditarNotaModal nota={editando} onCerrar={() => setEditando(null)} onGuardado={guardarEdicion} />
    </div>
  );
}
