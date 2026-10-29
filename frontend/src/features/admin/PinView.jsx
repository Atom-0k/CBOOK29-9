import { useState, useEffect, useCallback } from "react";
import { Search, ShieldCheck, ShieldOff, LockOpen, RefreshCw } from "lucide-react";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { AdminTable } from "../../components/admin/AdminTable";
import { Modal, ConfirmDialog } from "../../components/admin/Modal";
import { Toast } from "../../components/admin/Toast";
import { Badge, badgePorEstado } from "../../components/admin/Badge";
import { apiGet, apiPost, formatearFecha, hoyIso } from "../../components/admin/adminApi";
import { CURRENT_USER, CONECTADO_A_DJANGO } from "../../data/mock";

const inputClase =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

const CHIPS = [
  { id: "", label: "Todos" },
  { id: "activos", label: "Activos" },
  { id: "sin_pin", label: "Sin PIN" },
  { id: "bloqueados", label: "Bloqueados" },
  { id: "inactivos", label: "Deshabilitados" },
];

export function PinView() {
  const [alumnos, setAlumnos] = useState([]);
  const [cursos, setCursos] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(CONECTADO_A_DJANGO);
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [estado, setEstado] = useState("");
  const [curso, setCurso] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const [confirmar, setConfirmar] = useState(null);
  const [pinNuevo, setPinNuevo] = useState(null);
  const [toast, setToast] = useState(null);
  const [cerrando, setCerrando] = useState(false);

  const cargar = useCallback(() => {
    if (!CONECTADO_A_DJANGO) return;
    setCargando(true);
    const params = new URLSearchParams({ pagina, estado, curso, busqueda });
    apiGet(`/api/admin/pin/?${params}`)
      .then((d) => {
        setAlumnos(d.alumnos || []);
        setPaginas(d.paginas || 1);
        setTotal(d.total || 0);
        setResumen(d.resumen);
      })
      .catch(() => setAlumnos([]))
      .finally(() => setCargando(false));
  }, [pagina, estado, curso, busqueda]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    setPagina(1);
  }, [estado, curso, busqueda]);

  useEffect(() => {
    if (!CONECTADO_A_DJANGO) return;
    apiGet("/api/cursos/").then((d) => setCursos(d.cursos || [])).catch(() => {});
  }, []);

  const columnas = [
    { key: "nombre", label: "Alumno", render: (a) => <span className="font-semibold text-slate-800 dark:text-slate-100">{a.nombre}</span> },
    { key: "curso", label: "Curso", render: (a) => <Badge color="azul">{a.curso || "—"}</Badge> },
    {
      key: "estado", label: "Estado del PIN", render: (a) => {
        const b = badgePorEstado(a.estado);
        return <Badge color={b.color}>{b.label}</Badge>;
      },
    },
    { key: "intentos", label: "Intentos fallidos", render: (a) => (
        <span className={`text-xs font-semibold ${a.intentosFallidos >= 5 ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"}`}>
          {a.intentosFallidos}
        </span>
      ),
    },
    { key: "ultimoUso", label: "Último uso", render: (a) => <span className="text-xs text-slate-500 dark:text-slate-400">{formatearFecha(a.ultimoUso, true)}</span> },
    { key: "creado", label: "Creado", render: (a) => <span className="text-xs text-slate-500 dark:text-slate-400">{formatearFecha(a.fechaCreacion)}</span> },
    {
      key: "acciones", label: "", className: "text-right", render: (a) => (
        <div className="flex justify-end gap-0.5">
          <button
            onClick={() => setConfirmar({ accion: a.estado === "sin_pin" ? "generar" : "regenerar", a })}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-cyan-700 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
            aria-label="Generar o regenerar PIN"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          {a.estado === "bloqueado" && (
            <button onClick={() => setConfirmar({ accion: "desbloquear", a })} className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-400" aria-label="Desbloquear PIN">
              <LockOpen className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => setConfirmar({ accion: a.habilitado ? "deshabilitar" : "habilitar", a })}
            className={`rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 ${a.habilitado ? "text-amber-600" : "text-emerald-600"}`}
            aria-label={a.habilitado ? "Deshabilitar PIN" : "Habilitar PIN"}
          >
            {a.habilitado ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          </button>
        </div>
      ),
    },
  ];

  async function ejecutar() {
    if (!confirmar) return;
    setCerrando(true);
    const { accion, a } = confirmar;
    try {
      if (accion === "generar" || accion === "regenerar") {
        const res = await apiPost("/api/admin/pin/accion/", { gmail: a.gmail, accion });
        setPinNuevo({ gmail: a.gmail, pin: res.pin, nombre: a.nombre });
      } else {
        await apiPost("/api/admin/pin/accion/", { gmail: a.gmail, accion });
        setToast({ tipo: "ok", mensaje: accion === "desbloquear" ? "PIN desbloqueado." : "PIN " + (accion === "habilitar" ? "habilitado." : "deshabilitado.") });
      }
      setConfirmar(null);
      cargar();
    } catch (e) {
      setToast({ tipo: "error", mensaje: e.message });
      setConfirmar(null);
    } finally {
      setCerrando(false);
    }
  }

  return (
    <div>
      <SectionHeading eyebrow={CURRENT_USER.rol} title="Gestión de PIN" />

      <div className="mb-4 flex flex-wrap gap-2">
        {CHIPS.map((c) => {
          const cant = c.id === "" ? resumen?.total : resumen?.[c.id];
          return (
            <button
              key={c.id}
              onClick={() => setEstado(c.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                estado === c.id
                  ? "bg-cyan-700 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {c.label}
              {typeof cant === "number" && <span className={estado === c.id ? "ml-1.5 text-cyan-200" : "ml-1.5 text-slate-400"}>{cant}</span>}
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por alumno…" className={`${inputClase} pl-9`} />
        </div>
        <select value={curso} onChange={(e) => setCurso(e.target.value)} className={inputClase + " w-auto"}>
          <option value="">Todos los cursos</option>
          {cursos.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <AdminTable
        columns={columnas}
        rows={alumnos}
        rowKey={(a) => a.gmail}
        loading={cargando}
        pagination={{ pagina, paginas, total, onChange: setPagina }}
        empty={{ title: "No hay alumnos que coincidan" }}
      />

      <ConfirmDialog
        open={!!confirmar}
        onClose={() => !cerrando && setConfirmar(null)}
        onConfirm={ejecutar}
        cargando={cerrando}
        title={
          confirmar?.accion === "generar" ? "Generar PIN" :
          confirmar?.accion === "regenerar" ? "Regenerar PIN" :
          confirmar?.accion === "desbloquear" ? "Desbloquear PIN" :
          confirmar?.accion === "habilitar" ? "Habilitar PIN" : "Deshabilitar PIN"
        }
        text={
          confirmar?.accion === "generar" || confirmar?.accion === "regenerar"
            ? `Se genera un PIN nuevo para ${confirmar?.a.nombre}. El PIN anterior deja de funcionar.`
            : confirmar?.accion === "desbloquear"
            ? `Se restablece el PIN de ${confirmar?.a.nombre} y se ponen los intentos fallidos en cero.`
            : confirmar?.accion === "habilitar"
            ? `El PIN de ${confirmar?.a.nombre} vuelve a estar habilitado.`
            : `El PIN de ${confirmar?.a.nombre} deja de aceptar confirmaciones hasta que lo habilites de nuevo.`
        }
        confirmLabel={
          confirmar?.accion === "generar" ? "Generar" :
          confirmar?.accion === "regenerar" ? "Regenerar" :
          confirmar?.accion === "desbloquear" ? "Desbloquear" :
          confirmar?.accion === "habilitar" ? "Habilitar" : "Deshabilitar"
        }
      />

      <Modal
        open={!!pinNuevo}
        onClose={() => setPinNuevo(null)}
        title="PIN del responsable"
        subtitle={`Mostralo al responsable de ${pinNuevo?.nombre} (${pinNuevo?.gmail}) — se muestra una sola vez.`}
      >
        <div className="rounded-xl border-2 border-dashed border-cyan-600 bg-cyan-50 p-6 text-center dark:bg-cyan-900/30">
          <p className="text-3xl font-bold tracking-[0.3em] text-cyan-800 dark:text-cyan-200">{pinNuevo?.pin}</p>
          <p className="mt-2 text-xs text-cyan-700 dark:text-cyan-300">Generado el {hoyIso()}</p>
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={() => setPinNuevo(null)} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800">
            Listo
          </button>
        </div>
      </Modal>

      <Toast mensaje={toast?.mensaje} tipo={toast?.tipo} onClose={() => setToast(null)} />
    </div>
  );
}
