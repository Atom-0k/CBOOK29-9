import { useCallback, useEffect, useState } from "react";
import { Download, FileText, History, Loader2, RefreshCw } from "lucide-react";
import { apiGet, apiDescargar, formatearFecha } from "../admin/adminApi";
import { Modal } from "../admin/Modal";
import { Skeleton } from "../ui/Skeleton";

const TIPO_TEXTO = {
  institucional: "Institucional",
  materia: "Por materia",
};

const ESTADO_CHIP = {
  Presente: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  Ausente: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400",
  Tarde: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
};

function Chip({ children, className = "" }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}>
      {children}
    </span>
  );
}

/**
 * Historial de actas de asistencia guardadas, con descarga en PDF.
 *
 * Cada vez que se guarda la asistencia se genera un acta con el estado de
 * ese momento, así que esta lista es el respaldo de lo que se tomó.
 */
export function ActasGuardadas({ curso, refrescar = 0 }) {
  const [actas, setActas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [detalle, setDetalle] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [descargando, setDescargando] = useState(null);

  const cargar = useCallback(() => {
    if (!curso) return;
    const params = new URLSearchParams({ curso, limite: "30" });
    setCargando(true);
    apiGet(`/api/asistencia/actas/?${params}`)
      .then((d) => {
        setActas(d.actas || []);
        setError("");
      })
      .catch((e) => setError(e.message || "No se pudieron cargar las actas."))
      .finally(() => setCargando(false));
  }, [curso]);

  useEffect(() => { cargar(); }, [cargar, refrescar]);

  function verDetalle(acta) {
    setDetalle(acta);
    setCargandoDetalle(true);
    apiGet(`/api/asistencia/actas/detalle/?clave=${encodeURIComponent(acta.clave)}`)
      .then((d) => setDetalle(d.acta))
      .catch((e) => { setError(e.message || "No se pudo abrir el acta."); setDetalle(null); })
      .finally(() => setCargandoDetalle(false));
  }

  async function descargar(acta) {
    setDescargando(acta.clave);
    setError("");
    try {
      await apiDescargar(
        `/api/asistencia/actas/pdf/?clave=${encodeURIComponent(acta.clave)}`,
        `acta_${acta.curso}_${acta.fecha}.pdf`,
      );
    } catch (e) {
      setError(e.message || "No se pudo descargar el PDF.");
    } finally {
      setDescargando(null);
    }
  }

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/60">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <FileText className="h-4 w-4" aria-hidden="true" />
          Actas guardadas
          {curso && <span className="font-normal text-slate-400 dark:text-slate-500">· {curso}</span>}
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
            {actas.length}
          </span>
        </div>
        <button
          type="button"
          onClick={cargar}
          disabled={cargando}
          aria-label="Actualizar actas"
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-cyan-700 disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
        >
          <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <p className="px-4 py-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>
      )}

      {cargando && actas.length === 0 ? (
        <div className="space-y-2 px-4 py-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : actas.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
          Todavía no guardaste ninguna asistencia en {curso || "este curso"}.
          <br />
          Cuando guardes, el acta queda archivada acá y podés bajarla en PDF.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {actas.map((a) => (
            <li key={a.clave} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {formatearFecha(a.fecha)}
                  <span className="ml-2 font-normal text-slate-400 dark:text-slate-500">
                    {a.tipo === "materia" ? a.materia : `Turno ${a.turno || ""}`}
                  </span>
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                  <span>{TIPO_TEXTO[a.tipo] || a.tipo}</span>
                  <span>·</span>
                  <span>Tomada por {a.generadoPor || "s/d"}{a.generadoPorRol ? ` (${a.generadoPorRol})` : ""}</span>
                  {a.version > 1 && (
                    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      · <History className="h-3 w-3" aria-hidden="true" />Rev. {a.version}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                {a.resumen?.presentes > 0 && (
                  <Chip className={ESTADO_CHIP.Presente}>{a.resumen.presentes} P</Chip>
                )}
                {a.resumen?.ausentes > 0 && (
                  <Chip className={ESTADO_CHIP.Ausente}>{a.resumen.ausentes} A</Chip>
                )}
                {a.resumen?.tardes > 0 && (
                  <Chip className={ESTADO_CHIP.Tarde}>{a.resumen.tardes} T</Chip>
                )}
                {a.resumen?.sinMarcar > 0 && (
                  <Chip className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {a.resumen.sinMarcar} sin marcar
                  </Chip>
                )}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => verDetalle(a)}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-cyan-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
                >
                  Ver
                </button>
                <button
                  type="button"
                  onClick={() => descargar(a)}
                  disabled={descargando === a.clave}
                  aria-label={`Descargar acta del ${a.fecha} en PDF`}
                  className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-cyan-700 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
                >
                  {descargando === a.clave ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!detalle}
        onClose={() => setDetalle(null)}
        title="Acta de asistencia"
        subtitle={
          detalle
            ? `${formatearFecha(detalle.fecha)} · ${detalle.curso} · ${
                detalle.tipo === "materia" ? detalle.materia : `Turno ${detalle.turno || ""}`
              }`
            : ""
        }
        size="lg"
      >
        {cargandoDetalle ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : detalle ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              {detalle.resumen?.presentes > 0 && (
                <Chip className={ESTADO_CHIP.Presente}>{detalle.resumen.presentes} presentes</Chip>
              )}
              {detalle.resumen?.ausentes > 0 && (
                <Chip className={ESTADO_CHIP.Ausente}>{detalle.resumen.ausentes} ausentes</Chip>
              )}
              {detalle.resumen?.tardes > 0 && (
                <Chip className={ESTADO_CHIP.Tarde}>{detalle.resumen.tardes} tardes</Chip>
              )}
              {detalle.resumen?.sinMarcar > 0 && (
                <Chip className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {detalle.resumen.sinMarcar} sin marcar
                </Chip>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800">
                    <th className="px-2 py-2">Alumno</th>
                    <th className="px-2 py-2">Estado</th>
                    <th className="px-2 py-2">Hora</th>
                    <th className="px-2 py-2">Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {(detalle.registros || []).map((r) => (
                    <tr key={r.gmail} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                      <td className="px-2 py-2 text-slate-900 dark:text-slate-100">
                        {r.apellido}, {r.nombres}
                      </td>
                      <td className="px-2 py-2">
                        {r.estado ? (
                          <Chip className={ESTADO_CHIP[r.estado] || ""}>{r.estado}</Chip>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500">Sin marcar</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-500 dark:text-slate-400">
                        {r.horaIngreso || "—"}
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-500 dark:text-slate-400">
                        {r.observacion || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Creada el {formatearFecha(detalle.creado, true)} por {detalle.generadoPor || "s/d"}.
              {detalle.version > 1 && ` Última actualización: ${formatearFecha(detalle.actualizado, true)} (revisión ${detalle.version}).`}
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
