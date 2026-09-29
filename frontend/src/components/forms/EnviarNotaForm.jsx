import { useState, useEffect, useMemo } from "react";
import { Send, Loader2 } from "lucide-react";
import { SectionHeading } from "../ui/SectionHeading";
import { SelectorDestinatarios } from "./SelectorDestinatarios";
import { ConfirmDialog } from "../admin/Modal";
import { TIPO_NOTA } from "../../config/tipoNota";
import { CURRENT_USER, CONECTADO_A_DJANGO, MOCK_ALUMNOS_CURSO } from "../../data/mock";
import { getCsrfToken } from "../../utils/csrf";

// A partir de cuántos destinatarios se pide confirmación antes de enviar:
// mandar una nota a 20 alumnos no es lo mismo que a uno, y conviene que el
// docente lo vea antes de que salga.
const AVISO_CANTIDAD = 6;

export function EnviarNotaForm({ cursos }) {
  const [asignacionId, setAsignacionId] = useState("");
  const [alumnos, setAlumnos] = useState([]);
  const [cargandoAlumnos, setCargandoAlumnos] = useState(false);
  const [errorAlumnos, setErrorAlumnos] = useState(null);
  // Arreglo de gmail, no un string: una nota puede ir a varias personas.
  const [seleccion, setSeleccion] = useState([]);
  const [tipo, setTipo] = useState("comunicado");
  const [titulo, setTitulo] = useState("");
  const [contenido, setContenido] = useState("");
  const [requierePin, setRequierePin] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [confirmar, setConfirmar] = useState(null);

  const asignacionActual = useMemo(
    () => cursos.find((c) => c._id === asignacionId) || null,
    [cursos, asignacionId],
  );
  const curso = asignacionActual?.curso || "";

  // Nombres de lo que quedó marcado, para los textos de confirmación.
  const nombresSeleccionados = useMemo(
    () => alumnos.filter((a) => seleccion.includes(a.gmail)).map((a) => a.nombre),
    [alumnos, seleccion],
  );

  useEffect(() => {
    if (!asignacionActual) {
      setAlumnos([]);
      setErrorAlumnos(null);
      setSeleccion([]);
      return;
    }
    // Por defecto va a todo el curso, que es lo que se hacía antes siempre.
    setSeleccion([]);
    if (!CONECTADO_A_DJANGO) {
      setAlumnos(MOCK_ALUMNOS_CURSO);
      setSeleccion(MOCK_ALUMNOS_CURSO.map((a) => a.gmail));
      setErrorAlumnos(null);
      return;
    }
    setAlumnos([]);
    setErrorAlumnos(null);
    setCargandoAlumnos(true);
    fetch(`/api/alumnos/?curso=${encodeURIComponent(asignacionActual.curso)}&asignacion=${encodeURIComponent(asignacionActual._id)}`, { credentials: "same-origin" })
      .then((r) => {
        if (r.status === 403) {
          return r.json().then((d) => { throw new Error(d.error || "No tenés autorización para acceder a los alumnos de este curso."); });
        }
        if (r.status === 404) {
          return r.json().then((d) => { throw new Error(d.error || "El curso no existe."); });
        }
        if (!r.ok) {
          return r.json().then((d) => { throw new Error(d.error || "Error del servidor."); });
        }
        return r.json();
      })
      .then((data) => {
        const lista = data.alumnos || [];
        setAlumnos(lista);
        // Todo el curso viene marcado por defecto, igual que antes.
        setSeleccion(lista.map((a) => a.gmail));
      })
      .catch((err) => { setAlumnos([]); setSeleccion([]); setErrorAlumnos(err.message); })
      .finally(() => setCargandoAlumnos(false));
  }, [asignacionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // El botón de enviar se habilita sólo si hay a quién mandarle.
  const puedeEnviar = Boolean(asignacionActual) && seleccion.length > 0 && !cargandoAlumnos;

  function pedirEnvio(e) {
    e.preventDefault();
    setMensaje(null);
    if (!CONECTADO_A_DJANGO) {
      setMensaje({ tipo: "error", texto: "Esto solo guarda de verdad cuando lo sirve Django." });
      return;
    }
    if (seleccion.length === 0) {
      setMensaje({ tipo: "error", texto: "Elegí al menos un alumno destinatario." });
      return;
    }
    if (seleccion.length >= AVISO_CANTIDAD) {
      setConfirmar(true);
      return;
    }
    enviar();
  }

  async function enviar() {
    setEnviando(true);
    setConfirmar(false);
    try {
      const resp = await fetch("/api/notas/crear/", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
        body: JSON.stringify({
          curso,
          asignacionId: asignacionId || undefined,
          destinatarios: seleccion,
          tipo,
          titulo,
          contenido,
          requierePin,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "No se pudo guardar la nota.");
      // El texto dice a cuántos les llegó, que es lo que el docente necesita
      // confirmar (y no "se envió bien" a secas).
      const alcance = data.destinatarios || `${seleccion.length} alumnos`;
      setMensaje({
        tipo: "ok",
        texto: requierePin
          ? `Nota enviada a ${alcance}. Si un alumno no recuerda su PIN, podrá escribirte desde la nota.`
          : `Nota enviada a ${alcance}.`,
      });
      setTitulo(""); setContenido(""); setRequierePin(false);
      // Se deja la selección como estaba: mandar varias notas seguidas a
      // grupos parecidos es el flujo normal de un preceptor.
    } catch (err) {
      setMensaje({ tipo: "error", texto: err.message || "Ocurrió un error." });
    } finally {
      setEnviando(false);
    }
  }

  const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-cyan-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 disabled:opacity-60";
  const labelClass = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400";

  return (
    <div>
      <SectionHeading eyebrow={CURRENT_USER.rol} title="Enviar Nota" />
      <form onSubmit={pedirEnvio} className="max-w-xl space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div>
          <label className={labelClass}>Curso</label>
          <select value={asignacionId} onChange={(e) => setAsignacionId(e.target.value)} required className={inputClass}>
            <option value="">Seleccioná un curso</option>
            {cursos.map((c) => (
              <option key={c._id} value={c._id}>{c.curso}{c.materia ? ` — ${c.materia}` : " — Preceptor"}</option>
            ))}
          </select>
        </div>
        {asignacionActual && (
          <div>
            <label className={labelClass}>¿A quién se le envía?</label>
            <SelectorDestinatarios
              alumnos={alumnos}
              cargando={cargandoAlumnos}
              error={errorAlumnos}
              seleccion={seleccion}
              onCambiar={setSeleccion}
            />
          </div>
        )}
        <div>
          <label className={labelClass}>Tipo de nota</label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(TIPO_NOTA).map(([id, meta]) => (
              <button key={id} type="button" onClick={() => setTipo(id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${tipo === id ? "bg-cyan-800 text-white dark:bg-cyan-600" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-700"}`}>
                {meta.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelClass}>Título</label>
          <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Contenido</label>
          <textarea value={contenido} onChange={(e) => setContenido(e.target.value)} rows={4} required className={inputClass} />
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={requierePin}
            onChange={(e) => setRequierePin(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-cyan-700 focus:ring-cyan-600"
          />
          <span>
            Requiere confirmación con PIN del responsable
            <span className="block text-xs text-slate-400 dark:text-slate-500">
              {seleccion.length > 1
                ? `Cada uno de los ${seleccion.length} alumnos confirma por separado con su propio PIN.`
                : "El alumno tendrá que ingresar su PIN para confirmar la nota."}
            </span>
          </span>
        </label>

        <button type="submit" disabled={enviando || !puedeEnviar} className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-teal-900 disabled:opacity-60 dark:bg-teal-600 dark:hover:bg-teal-500">
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {enviando ? "Guardando..." : `Enviar a ${seleccion.length || 0} ${seleccion.length === 1 ? "alumno" : "alumnos"}`}
        </button>
        {mensaje && <p className={`text-center text-xs font-medium ${mensaje.tipo === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{mensaje.texto}</p>}
      </form>

      <ConfirmDialog
        open={!!confirmar}
        onClose={() => !enviando && setConfirmar(false)}
        onConfirm={enviar}
        title="Enviar la nota a varios alumnos"
        text={`Se va a enviar a ${seleccion.length} alumnos: ${nombresSeleccionados.slice(0, 4).join(", ")}${nombresSeleccionados.length > 4 ? ` y ${nombresSeleccionados.length - 4} más` : ""}.`}
        confirmLabel={`Enviar a ${seleccion.length}`}
        cargando={enviando}
      />
    </div>
  );
}
