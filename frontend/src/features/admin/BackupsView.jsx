import { useState, useEffect, useCallback } from "react";
import { DatabaseBackup, Download, RotateCcw, FolderOpen, Plus, Loader2 } from "lucide-react";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { AdminTable } from "../../components/admin/AdminTable";
import { ConfirmDialog } from "../../components/admin/Modal";
import { Toast } from "../../components/admin/Toast";
import { apiGet, apiPost, apiDescargar, formatearFecha, formatearBytes } from "../../components/admin/adminApi";
import { CURRENT_USER, CONECTADO_A_DJANGO } from "../../data/mock";

const MOCK_BACKUPS = [];

export function BackupsView() {
  const [backups, setBackups] = useState(CONECTADO_A_DJANGO ? [] : MOCK_BACKUPS);
  const [carpeta, setCarpeta] = useState("");
  const [cargando, setCargando] = useState(CONECTADO_A_DJANGO);
  const [creando, setCreando] = useState(false);
  const [restaurar, setRestaurar] = useState(null);
  const [cerrando, setCerrando] = useState(false);
  const [toast, setToast] = useState(null);
  const [descargando, setDescargando] = useState(null);

  async function descargar(b) {
    setDescargando(b.nombre);
    try {
      await apiDescargar(
        `/api/admin/backups/descargar/?nombre=${encodeURIComponent(b.nombre)}`,
        b.nombre,
      );
    } catch (e) {
      setToast({ tipo: "error", mensaje: e.message });
    } finally {
      setDescargando(null);
    }
  }

  const cargar = useCallback(() => {
    if (!CONECTADO_A_DJANGO) return;
    setCargando(true);
    apiGet("/api/admin/backups/")
      .then((d) => {
        setBackups(d.backups || []);
        setCarpeta(d.carpeta || "");
      })
      .catch(() => setBackups([]))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function crearBackup() {
    setCreando(true);
    try {
      await apiPost("/api/admin/backups/crear/", {});
      setToast({ tipo: "ok", mensaje: "Backup creado correctamente." });
      cargar();
    } catch (e) {
      setToast({ tipo: "error", mensaje: e.message });
    } finally {
      setCreando(false);
    }
  }

  async function ejecutarRestauracion() {
    if (!restaurar) return;
    setCerrando(true);
    try {
      await apiPost("/api/admin/backups/restaurar/", { nombre: restaurar });
      setToast({ tipo: "ok", mensaje: "Backup restaurado. La base quedó como estaba en ese momento." });
      setRestaurar(null);
      cargar();
    } catch (e) {
      setToast({ tipo: "error", mensaje: e.message });
      setRestaurar(null);
    } finally {
      setCerrando(false);
    }
  }

  const columnas = [
    { key: "nombre", label: "Archivo", render: (b) => (
        <div>
          <p className="font-semibold text-slate-800 dark:text-slate-100">{b.nombre}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">{formatearBytes(b.tamano)}</p>
        </div>
      ),
    },
    { key: "fecha", label: "Fecha", render: (b) => <span className="text-xs text-slate-500 dark:text-slate-400">{formatearFecha(b.fecha, true)}</span> },
    { key: "creadoPor", label: "Creado por", render: (b) => <span className="text-xs text-slate-600 dark:text-slate-300">{b.creadoPor || "—"}</span> },
    {
      key: "acciones", label: "", className: "text-right", render: (b) => (
        <div className="flex justify-end gap-1">
          <button
            onClick={() => descargar(b)}
            disabled={descargando === b.nombre}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-cyan-700 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
            aria-label="Descargar"
          >
            {descargando === b.nombre ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </button>
          <button onClick={() => setRestaurar(b.nombre)} className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-900/30 dark:hover:text-amber-400" aria-label="Restaurar">
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <SectionHeading
        eyebrow={CURRENT_USER.rol}
        title="Copias de seguridad"
        action={
          <button
            onClick={crearBackup}
            disabled={creando}
            className="flex items-center gap-2 rounded-lg bg-cyan-700 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-800 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {creando ? "Creando…" : "Crear backup"}
          </button>
        }
      />

      <p className="mb-4 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <DatabaseBackup className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
        Cada backup es una foto completa de la base (usuarios, notas, calificaciones, horarios, auditoría).
      </p>

      <AdminTable
        columns={columnas}
        rows={backups}
        rowKey={(b) => b.nombre}
        loading={cargando}
        empty={{
          icon: DatabaseBackup,
          title: "Todavía no hay backups",
          text: "Creá el primero para tener una copia de seguridad de todo el sistema.",
        }}
      />

      {carpeta && (
        <p className="mt-4 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <FolderOpen className="h-3.5 w-3.5" /> Carpeta de backups: <code className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">{carpeta}</code>
        </p>
      )}

      <ConfirmDialog
        open={!!restaurar}
        onClose={() => !cerrando && setRestaurar(null)}
        onConfirm={ejecutarRestauracion}
        cargando={cerrando}
        title="Restaurar backup"
        text={`Se van a reemplazar TODOS los datos actuales por los del backup ${restaurar}. Esta acción no se puede deshacer.`}
        confirmLabel="Restaurar"
        danger
      />

      <Toast mensaje={toast?.mensaje} tipo={toast?.tipo} onClose={() => setToast(null)} />
    </div>
  );
}
