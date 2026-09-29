import { useState, useEffect } from "react";
import { Settings, Save } from "lucide-react";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { Toast } from "../../components/admin/Toast";
import { Toggle } from "../../components/admin/Toggle";
import { apiGet, apiPost } from "../../components/admin/adminApi";
import { CURRENT_USER, CONECTADO_A_DJANGO } from "../../data/mock";

const inputClase =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

const MOCK_CONFIG = {
  nombre_escuela: "Escuela de Educación Técnica",
  anio_lectivo: String(new Date().getFullYear()),
  duracion_sesion_min: 480,
  long_min_contrasena: 4,
  long_pin: 8,
  modo_mantenimiento: false,
  notificaciones_email: false,
  limite_inasistencias: 28,
  porcentaje_min_asistencia: 75,
  minutos_tolerancia_tardia: 20,
};

function Campo({ label, help, children }) {
  return (
    <div className="sm:col-span-1">
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</label>
      {children}
      {help && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{help}</p>}
    </div>
  );
}

export function ConfiguracionView() {
  const [form, setForm] = useState(CONECTADO_A_DJANGO ? null : MOCK_CONFIG);
  const [cargando, setCargando] = useState(CONECTADO_A_DJANGO);
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!CONECTADO_A_DJANGO) return;
    apiGet("/api/admin/config/")
      .then((d) => setForm({ ...MOCK_CONFIG, ...(d.config || {}) }))
      .catch(() => setForm(MOCK_CONFIG))
      .finally(() => setCargando(false));
  }, []);

  const set = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

  async function guardar(e) {
    e.preventDefault();
    if (!form) return;
    setGuardando(true);
    try {
      await apiPost("/api/admin/config/guardar/", form);
      setToast({ tipo: "ok", mensaje: "Configuración guardada." });
    } catch (err) {
      setToast({ tipo: "error", mensaje: err.message });
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return (
      <div>
        <SectionHeading eyebrow={CURRENT_USER.rol} title="Configuración" />
        <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
      </div>
    );
  }

  if (!form) return null;

  return (
    <div>
      <SectionHeading eyebrow={CURRENT_USER.rol} title="Configuración" />

      <form onSubmit={guardar} className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <Settings className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            Institución
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Campo label="Nombre de la escuela">
                <input className={inputClase} value={form.nombre_escuela} onChange={set("nombre_escuela")} />
              </Campo>
            </div>
            <Campo label="Año lectivo">
              <input className={inputClase} value={form.anio_lectivo} onChange={set("anio_lectivo")} />
            </Campo>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Seguridad</h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Campo
              label="Duración de sesión (min)"
              help="Inactividad antes de pedir login de nuevo. Se renueva sola mientras la persona siga trabajando. Tope absoluto: 12 h."
            >
              <input type="number" min="5" max="720" className={inputClase} value={form.duracion_sesion_min} onChange={set("duracion_sesion_min")} />
            </Campo>
            <Campo label="Largo mínimo de contraseña">
              <input type="number" min="4" className={inputClase} value={form.long_min_contrasena} onChange={set("long_min_contrasena")} />
            </Campo>
            <Campo label="Largo del PIN" help="Cantidad de dígitos del PIN del responsable.">
              <input type="number" min="4" max="10" className={inputClase} value={form.long_pin} onChange={set("long_pin")} />
            </Campo>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <Settings className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            Asistencia
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Campo label="Límite de inasistencias" help="Cantidad máxima de faltas institucionales por año lectivo.">
              <input type="number" min="1" className={inputClase} value={form.limite_inasistencias} onChange={set("limite_inasistencias")} />
            </Campo>
            <Campo label="Asistencia mínima (%)" help="Porcentaje mínimo por materia para aprobar la regularidad.">
              <input type="number" min="1" max="100" className={inputClase} value={form.porcentaje_min_asistencia} onChange={set("porcentaje_min_asistencia")} />
            </Campo>
            <Campo label="Tolerancia tardes (min)" help={'Minutos de retraso que se computan como "Tarde" (0,25) y no como ausente.'}>
              <input type="number" min="0" max="120" className={inputClase} value={form.minutos_tolerancia_tardia} onChange={set("minutos_tolerancia_tardia")} />
            </Campo>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Estado y avisos</h3>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Modo mantenimiento</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">El sistema queda en mantenimiento y el dashboard del admin lo avisa.</p>
              </div>
              <Toggle checked={!!form.modo_mantenimiento} onChange={(v) => setForm((f) => ({ ...f, modo_mantenimiento: v }))} label="Modo mantenimiento" />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Notificaciones por email</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">Avisar por email cuando llega una comunicación nueva (requiere un servidor de correo).</p>
              </div>
              <Toggle checked={!!form.notificaciones_email} onChange={(v) => setForm((f) => ({ ...f, notificaciones_email: v }))} label="Notificaciones por email" />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={guardando} className="flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-800 disabled:opacity-50">
            <Save className="h-4 w-4" />
            {guardando ? "Guardando…" : "Guardar configuración"}
          </button>
        </div>
      </form>

      <Toast mensaje={toast?.mensaje} tipo={toast?.tipo} onClose={() => setToast(null)} />
    </div>
  );
}
