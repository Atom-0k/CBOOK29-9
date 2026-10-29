import { useState, useEffect, useCallback } from "react";
import { Search, Archive, ArchiveRestore, Trash2, Trash, Eye } from "lucide-react";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { AdminTable } from "../../components/admin/AdminTable";
import { Modal, ConfirmDialog } from "../../components/admin/Modal";
import { Toast } from "../../components/admin/Toast";
import { Badge, badgePorTipoNota, badgePorEstado } from "../../components/admin/Badge";
import { apiGet, apiPost, formatearFecha } from "../../components/admin/adminApi";
import { CURRENT_USER, CONECTADO_A_DJANGO } from "../../data/mock";

const inputClase =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

const CHIPS = [
  { id: "", label: "Todas" },
  { id: "pendientes", label: "Pendientes" },
  { id: "confirmadas", label: "Confirmadas" },
  { id: "archivadas", label: "Archivadas" },
  { id: "papelera", label: "Papelera" },
];

function estadoNota(n) {
  if (n.eliminada) return "papelera";
  if (n.archivada) return "archivada";
  if (n.requierePin && n.confirmada) return "confirmada";
  if (n.requierePin && !n.confirmada) return "pendiente";
  return "sin_pin_confirmacion";
}

export function ComunicadosView() {
  const [comunicados, setComunicados] = useState([]);
  const [cursos, setCursos] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(CONECTADO_A_DJANGO);
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [estado, setEstado] = useState("");
  const [curso, setCurso] = useState("");
  const [tipo, setTipo] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const [detalle, setDetalle] = useState(null);
  const [confirmar, setConfirmar] = useState(null);
  const [toast, setToast] = useState(null);
  const [cerrando, setCerrando] = useState(false);

  const cargar = useCallback(() => {
    if (!CONECTADO_A_DJANGO) return;
    setCargando(true);
    const params = new URLSearchParams({ pagina, estado, curso, tipo, busqueda });
    apiGet(`/api/admin/comunicados/?${params}`)
      .then((d) => {
        setComunicados(d.comunicados || []);
        setPaginas(d.paginas || 1);
        setTotal(d.total || 0);
        setResumen(d.resumen);
      })
      .catch(() => setComunicados([]))
      .finally(() => setCargando(false));
  }, [pagina, estado, curso, tipo, busqueda]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    setPagina(1);
  }, [estado, curso, tipo, busqueda]);

  useEffect(() => {
    if (!CONECTADO_A_DJANGO) return;
    apiGet("/api/cursos/").then((d) => setCursos(d.cursos || [])).catch(() => {});
  }, []);

  const columnas = [
    {
      key: "titulo", label: "Comunicación", render: (n) => (
        <div className="max-w-xs">
          <p className="truncate font-semibold text-slate-800 dark:text-slate-100">{n.titulo}</p>
          <p className="truncate text-xs text-slate-400 dark:text-slate-500">{n.contenido}</p>
        </div>
      ),
    },
    { key: "tipo", label: "Tipo", render: (n) => { const b = badgePorTipoNota(n.tipo); return <Badge color={b.color}>{b.label}</Badge>; } },
    { key: "destino", label: "Destino", render: (n) => <span className="text-xs text-slate-600 dark:text-slate-300">{n.destino}</span> },
    { key: "autor", label: "Autor", render: (n) => <span className="text-xs text-slate-600 dark:text-slate-300">{n.autor}</span> },
    { key: "fecha", label: "Fecha", render: (n) => <span className="text-xs text-slate-500 dark:text-slate-400">{formatearFecha(n.fecha, true)}</span> },
    {
      key: "estado", label: "Estado", render: (n) => {
        const e = estadoNota(n);
        const b = badgePorEstado(e);
        return <Badge color={b.color}>{b.label}</Badge>;
      },
    },
    {
      key: "acciones", label: "", className: "text-right", render: (n) => (
        <div className="flex justify-end gap-0.5">
          <button onClick={() => setDetalle(n)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-cyan-700 dark:hover:bg-slate-800 dark:hover:text-cyan-300" aria-label="Ver detalle">
            <Eye className="h-4 w-4" />
          </button>
          {n.eliminada ? (
            <>
              <button onClick={() => setConfirmar({ accion: "restaurar", n })} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-cyan-700 dark:hover:bg-slate-800 dark:hover:text-cyan-300" aria-label="Restaurar">
                <ArchiveRestore className="h-4 w-4" />
              </button>
              <button onClick={() => setConfirmar({ accion: "eliminar_definitivo", n })} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30 dark:hover:text-rose-400" aria-label="Borrar definitivamente">
                <Trash className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setConfirmar({ accion: "archivar", n })} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-violet-600 dark:hover:bg-slate-800 dark:hover:text-violet-300" aria-label="Archivar">
                <Archive className="h-4 w-4" />
              </button>
              <button onClick={() => setConfirmar({ accion: "eliminar", n })} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30 dark:hover:text-rose-400" aria-label="Eliminar">
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  async function ejecutar() {
    if (!confirmar) return;
    setCerrando(true);
    try {
      await apiPost("/api/admin/comunicados/accion/", { id: confirmar.n.id, accion: confirmar.accion });
      setConfirmar(null);
      setDetalle(null);
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
      <SectionHeading eyebrow={CURRENT_USER.rol} title="Comunicados" />

      <div className="mb-4 flex flex-wrap gap-2">
        {CHIPS.map((c) => {
          const cant = c.id === "" ? resumen?.total : c.id === "papelera" ? resumen?.papelera : resumen?.[c.id];
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
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por título, contenido o autor…" className={`${inputClase} pl-9`} />
        </div>
        <select value={curso} onChange={(e) => setCurso(e.target.value)} className={inputClase + " w-auto"}>
          <option value="">Todos los cursos</option>
          {cursos.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputClase + " w-auto"}>
          <option value="">Todos los tipos</option>
          <option value="comunicado">Comunicado</option>
          <option value="citacion">Citación</option>
          <option value="amonestacion">Amonestación</option>
          <option value="felicitacion">Felicitación</option>
          <option value="nota">Nota</option>
        </select>
      </div>

      <AdminTable
        columns={columnas}
        rows={comunicados}
        rowKey={(n) => n.id}
        loading={cargando}
        pagination={{ pagina, paginas, total, onChange: setPagina }}
        empty={{ title: "No hay comunicaciones que coincidan" }}
      />

      <Modal open={!!detalle} onClose={() => setDetalle(null)} title={detalle?.titulo} subtitle={`${detalle?.tipo} · ${detalle?.autor}`}>
        {detalle && (
          <div className="space-y-4">
            <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{detalle.contenido}</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                <p className="text-slate-400">Destino</p>
                <p className="mt-0.5 font-semibold text-slate-700 dark:text-slate-200">{detalle.destino}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                <p className="text-slate-400">Enviada el</p>
                <p className="mt-0.5 font-semibold text-slate-700 dark:text-slate-200">{formatearFecha(detalle.fecha, true)}</p>
              </div>
              {detalle.requierePin && (
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                  <p className="text-slate-400">Confirmación</p>
                  <p className="mt-0.5 font-semibold text-slate-700 dark:text-slate-200">
                    {detalle.confirmada ? `Confirmada ${formatearFecha(detalle.fechaConfirmada, true)}` : "Pendiente de PIN"}
                  </p>
                </div>
              )}
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                <p className="text-slate-400">Curso</p>
                <p className="mt-0.5 font-semibold text-slate-700 dark:text-slate-200">{detalle.curso || "—"}</p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmar}
        onClose={() => !cerrando && setConfirmar(null)}
        onConfirm={ejecutar}
        cargando={cerrando}
        title={
          confirmar?.accion === "eliminar" ? "Eliminar comunicación" :
          confirmar?.accion === "eliminar_definitivo" ? "Borrar definitivamente" :
          confirmar?.accion === "restaurar" ? "Restaurar comunicación" : "Archivar comunicación"
        }
        text={
          confirmar?.accion === "eliminar" ? `"${confirmar?.n.titulo}" pasa a la papelera. Todavía se puede restaurar.` :
          confirmar?.accion === "eliminar_definitivo" ? `Se borrará para siempre "${confirmar?.n.titulo}". Esta acción no se puede deshacer.` :
          confirmar?.accion === "restaurar" ? `"${confirmar?.n.titulo}" vuelve a estar visible.` :
          `"${confirmar?.n.titulo}" se archiva y deja de mostrarse como pendiente.`
        }
        confirmLabel={
          confirmar?.accion === "eliminar" ? "Eliminar" :
          confirmar?.accion === "eliminar_definitivo" ? "Borrar para siempre" :
          confirmar?.accion === "restaurar" ? "Restaurar" : "Archivar"
        }
        danger={confirmar?.accion === "eliminar" || confirmar?.accion === "eliminar_definitivo"}
      />

      <Toast mensaje={toast?.mensaje} tipo={toast?.tipo} onClose={() => setToast(null)} />
    </div>
  );
}
