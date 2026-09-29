import { useState } from "react";
import { Lock, UserMinus, Unlock, UserCheck, ShieldAlert } from "lucide-react";
import { Modal } from "../../components/admin/Modal";

const MOTIVOS_BAJA = ["Traslado", "Finalización de estudios", "Solicitud familiar", "Baja administrativa", "Otro"];

const inputClase =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

/**
 * Modal que ejecuta un cambio de estado con su confirmación correspondiente.
 *
 * - bloquear:      restricción TEMPORAL (sigue siendo alumno). Pide motivo.
 * - baja:          deja de ser alumno activo (conserva todo el historial).
 *                  Pide motivo con lista + doble confirmación.
 * - desbloquear:   quita la restricción de un alumno activo.
 * - reactivar:     vuelve a convertir un alumno dado de baja en alumno activo.
 */
export function ModalEstado({ modo, usuario, etiqueta, cerrando, onCerrar, onConfirmar }) {
  const [motivo, setMotivo] = useState("");
  const [otro, setOtro] = useState("");
  const [paso, setPaso] = useState(1);
  const [err, setErr] = useState("");

  if (!modo || !usuario) return null;

  const cap = etiqueta ? etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1) : "Alumno";

  const textos = {
    bloquear: {
      icono: Lock,
      titulo: `Bloquear ${etiqueta}`,
      pregunta: `¿Bloquear a ${usuario.nombre}?`,
      descripcion: `${cap} continuará perteneciendo a la institución, pero su cuenta y/o determinadas funciones quedarán restringidas hasta que un administrador la desbloquee. Sus datos e historial no se modifican.`,
      motivoLabel: "Motivo del bloqueo",
      motivoPlaceholder: "Escribí el motivo del bloqueo…",
      motivoObligatorio: true,
      esSelect: false,
      confirmar: "Bloquear",
      peligro: true,
    },
    baja: {
      icono: UserMinus,
      titulo: "Dar de baja",
      pregunta: `¿Dar de baja a ${usuario.nombre}?`,
      descripcion: `${cap} dejará de ser considerado alumno activo de la institución y su acceso al sistema quedará deshabilitado.`,
      notaHistorial: "Su historial académico y administrativo no será eliminado.",
      motivoLabel: "Motivo de la baja",
      motivoObligatorio: true,
      esSelect: true,
      confirmar: "Confirmar baja",
      peligro: true,
    },
    desbloquear: {
      icono: Unlock,
      titulo: `Desbloquear ${etiqueta}`,
      pregunta: `¿Desbloquear a ${usuario.nombre}?`,
      descripcion: `${cap} volverá a tener acceso al sistema. Su estado pasará a Activo y seguirá siendo alumno de la institución.`,
      motivoLabel: "Motivo (opcional)",
      motivoPlaceholder: "Ej.: documentación completa",
      motivoObligatorio: false,
      esSelect: false,
      confirmar: "Desbloquear",
      peligro: false,
    },
    reactivar: {
      icono: UserCheck,
      titulo: `Reactivar ${etiqueta}`,
      pregunta: `¿Reactivar a ${usuario.nombre}?`,
      descripcion: `${cap} volverá al listado de alumnos activos. Su historial permanece intacto y se vuelve a habilitar su condición de alumno activo.`,
      motivoLabel: "Motivo (opcional)",
      motivoPlaceholder: "Ej.: regreso a la institución",
      motivoObligatorio: false,
      esSelect: false,
      confirmar: "Reactivar",
      peligro: false,
    },
  };

  const cfg = textos[modo];
  const Icono = cfg.icono;
  const esBajaDosPasos = modo === "baja" && paso === 2;

  function motivoFinal() {
    if (!cfg.esSelect) return motivo.trim();
    return motivo === "Otro" ? otro.trim() : motivo;
  }

  function continuar() {
    setErr("");
    if (cfg.esSelect && paso === 1) {
      if (!motivo) {
        setErr("Seleccioná el motivo de la baja.");
        return;
      }
      if (motivo === "Otro" && !otro.trim()) {
        setErr("Completá el motivo de la baja.");
        return;
      }
      setPaso(2);
      return;
    }
    if (cfg.motivoObligatorio && !motivoFinal()) {
      setErr(cfg.esSelect ? "Completá el motivo de la baja." : "Completá el motivo del bloqueo.");
      return;
    }
    onConfirmar(motivoFinal());
  }

  return (
    <Modal open onClose={onCerrar} title={cfg.titulo} subtitle={usuario.gmail}>
      {esBajaDosPasos ? (
        <div>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-rose-100 p-2.5 dark:bg-rose-900/40">
              <ShieldAlert className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                ¿Confirmar la baja definitiva de {usuario.nombre}?
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Esta acción es de larga duración. El alumno dejará de aparecer en el listado de
                alumnos activos y no podrá ingresar al sistema.
              </p>
              <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                Su historial académico y administrativo se conserva intacto. Podrás reactivarlo
                cuando lo consideres necesario.
              </p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Motivo: <span className="font-semibold text-slate-800 dark:text-slate-100">{motivoFinal()}</span>
              </p>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <button
              onClick={onCerrar}
              disabled={cerrando}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              onClick={() => onConfirmar(motivoFinal())}
              disabled={cerrando}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
            >
              {cerrando ? "Procesando…" : cfg.confirmar}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-start gap-3">
            <div className={cfg.peligro ? "rounded-full bg-rose-100 p-2.5 dark:bg-rose-900/40" : "rounded-full bg-cyan-100 p-2.5 dark:bg-cyan-900/40"}>
              <Icono className={cfg.peligro ? "h-5 w-5 text-rose-600 dark:text-rose-400" : "h-5 w-5 text-cyan-700 dark:text-cyan-400"} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{cfg.pregunta}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{cfg.descripcion}</p>
              {cfg.notaHistorial && (
                <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  {cfg.notaHistorial}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4">
            {cfg.esSelect ? (
              <>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {cfg.motivoLabel}
                </label>
                <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputClase}>
                  <option value="">Seleccionar motivo…</option>
                  {MOTIVOS_BAJA.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                {motivo === "Otro" && (
                  <input
                    value={otro}
                    onChange={(e) => setOtro(e.target.value)}
                    placeholder="Detallá el motivo…"
                    className={`${inputClase} mt-2`}
                  />
                )}
              </>
            ) : (
              <>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {cfg.motivoLabel}
                </label>
                {modo === "bloquear" ? (
                  <textarea
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    rows={3}
                    placeholder={cfg.motivoPlaceholder}
                    className={`${inputClase} resize-none`}
                  />
                ) : (
                  <input
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder={cfg.motivoPlaceholder}
                    className={inputClase}
                  />
                )}
              </>
            )}
            {err && <p className="mt-1 text-sm font-medium text-rose-600 dark:text-rose-400">{err}</p>}
          </div>

          <div className="mt-4 flex justify-end gap-3">
            <button
              onClick={onCerrar}
              disabled={cerrando}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            {cfg.esSelect ? (
              <button
                onClick={continuar}
                disabled={cerrando}
                className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-800 disabled:opacity-50"
              >
                Continuar
              </button>
            ) : (
              <button
                onClick={continuar}
                disabled={cerrando}
                className={
                  cfg.peligro
                    ? "rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
                    : "rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-800 disabled:opacity-50"
                }
              >
                {cerrando ? "Procesando…" : cfg.confirmar}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
