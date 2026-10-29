import { History } from "lucide-react";
import { Modal } from "../../components/admin/Modal";
import { Badge, badgePorEstado } from "../../components/admin/Badge";
import { formatearFecha } from "../../components/admin/adminApi";

const COLOR_ACCION = {
  Bloqueado: "rojo",
  Desbloqueado: "verde",
  "Dado de baja": "gris",
  Reactivado: "verde",
};

/**
 * Muestra el historial de cambios administrativos de estado del alumno:
 * fecha, acción, quién la realizó y el motivo. Bloquear es una restricción
 * temporal; dar de baja es un cambio de situación, y acá queda el registro.
 */
export function ModalHistorial({ usuario, onCerrar }) {
  if (!usuario) return null;
  const historial = usuario.historial || [];

  return (
    <Modal open onClose={onCerrar} title="Historial de estados" subtitle={usuario.gmail}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{usuario.nombre}</p>
        <Badge color={badgePorEstado(usuario.estado).color}>
          {usuario.estado === "Activo" ? "Alumno activo" : usuario.estado === "Bloqueado" ? "Alumno bloqueado" : usuario.estado === "Baja" ? "Dado de baja" : usuario.estado}
        </Badge>
      </div>

      {historial.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <History className="h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Sin cambios administrativos registrados todavía.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
                <th className="px-3 py-2 font-semibold">Fecha</th>
                <th className="px-3 py-2 font-semibold">Acción</th>
                <th className="px-3 py-2 font-semibold">Realizado por</th>
                <th className="px-3 py-2 font-semibold">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {[...historial].reverse().map((h, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500 dark:text-slate-400">
                    {formatearFecha(h.fecha, true)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge color={COLOR_ACCION[h.accion] || "gris"}>{h.accion}</Badge>
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{h.admin}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{h.motivo || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
