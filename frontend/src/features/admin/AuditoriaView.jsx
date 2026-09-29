import { useState, useEffect, useCallback } from "react";
import { Search, ScrollText } from "lucide-react";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { AdminTable } from "../../components/admin/AdminTable";
import { apiGet, formatearFecha } from "../../components/admin/adminApi";
import { CURRENT_USER, CONECTADO_A_DJANGO } from "../../data/mock";
import { DateInput } from "../../components/ui/DateInput";

const inputClase =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

const ACCIONES_DISPONIBLES = [
  "Crear alumno", "Crear profesor", "Crear preceptor", "Editar usuario", "Dar de baja", "Reactivar",
  "Bloquear", "Desbloquear", "Restablecer contraseña", "Generar PIN", "Regenerar PIN",
  "Habilitar PIN", "Deshabilitar PIN", "Crear curso", "Editar curso", "Duplicar curso",
  "Desactivar curso", "Activar curso", "Asignar materia", "Quitar materia", "Renombrar materia",
  "Eliminar nota", "Restaurar nota", "Archivar nota", "Desarchivar nota", "Borrar nota definitivamente",
  "Crear backup", "Restaurar backup", "Guardar configuración",
];

export function AuditoriaView() {
  const [logs, setLogs] = useState([]);
  const [cargando, setCargando] = useState(CONECTADO_A_DJANGO);
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  const [accion, setAccion] = useState("");
  const [usuario, setUsuario] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const cargar = useCallback(() => {
    if (!CONECTADO_A_DJANGO) return;
    setCargando(true);
    const params = new URLSearchParams({ pagina, busqueda, accion, usuario, desde, hasta });
    apiGet(`/api/admin/auditoria/?${params}`)
      .then((d) => {
        setLogs(d.logs || []);
        setPaginas(d.paginas || 1);
        setTotal(d.total || 0);
      })
      .catch(() => setLogs([]))
      .finally(() => setCargando(false));
  }, [pagina, busqueda, accion, usuario, desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    setPagina(1);
  }, [busqueda, accion, usuario, desde, hasta]);

  const columnas = [
    { key: "fecha", label: "Fecha y hora", render: (l) => <span className="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">{formatearFecha(l.fecha, true)}</span> },
    { key: "usuario", label: "Usuario", render: (l) => <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{l.usuario}</span> },
    { key: "accion", label: "Acción", render: (l) => <span className="text-xs font-medium text-cyan-700 dark:text-cyan-300">{l.accion}</span> },
    { key: "detalle", label: "Detalle", render: (l) => <span className="block max-w-[200px] truncate text-xs text-slate-500 dark:text-slate-400">{l.detalle || "—"}</span> },
    { key: "ip", label: "IP", render: (l) => <span className="text-xs text-slate-400 dark:text-slate-500">{l.ip}</span> },
    { key: "dispositivo", label: "Dispositivo", render: (l) => <span className="text-xs text-slate-400 dark:text-slate-500">{l.navegador} · {l.so}</span> },
  ];

  return (
    <div>
      <SectionHeading eyebrow={CURRENT_USER.rol} title="Auditoría de acciones" />

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en detalle…" className={`${inputClase} w-full pl-9`} />
        </div>
        <select value={accion} onChange={(e) => setAccion(e.target.value)} className={inputClase}>
          <option value="">Todas las acciones</option>
          {ACCIONES_DISPONIBLES.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="Usuario (Gmail)" className={inputClase} />
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <DateInput value={desde} onChange={setDesde} className="w-full justify-center" />
          </div>
          <div className="flex-1">
            <DateInput value={hasta} onChange={setHasta} className="w-full justify-center" />
          </div>
        </div>
      </div>

      <AdminTable
        columns={columnas}
        rows={logs}
        rowKey={(l) => l.id}
        loading={cargando}
        pagination={{ pagina, paginas, total, onChange: setPagina }}
        empty={{ icon: ScrollText, title: "Sin movimientos", text: "Todas las acciones del administrador se registran acá." }}
      />
    </div>
  );
}
