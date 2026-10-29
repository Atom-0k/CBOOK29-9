import { useState, useEffect } from "react";
import {
  GraduationCap,
  UserCog,
  UserCheck,
  BookOpen,
  Layers,
  Send,
  Clock,
  ShieldCheck,
  Ban,
  Activity,
  DatabaseBackup,
  BarChart3,
} from "lucide-react";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { StatCard } from "../../components/admin/StatCard";
import { StackedBars, GraficaCard } from "../../components/admin/charts";
import { Badge } from "../../components/admin/Badge";
import { apiGet, formatearFecha } from "../../components/admin/adminApi";
import { CURRENT_USER, CONECTADO_A_DJANGO } from "../../data/mock";

const MOCK_DASHBOARD = {
  alumnos: 128,
  profesores: 14,
  preceptores: 5,
  cursos: 12,
  materias: 22,
  notas_hoy: 7,
  notas_totales: 350,
  notas_pendientes: 24,
  notas_confirmadas: 180,
  en_papelera: 6,
  bloqueados: 2,
  activos_hoy: 41,
  ultimo_backup: null,
  config: { modo_mantenimiento: false },
  series: {
    notas_por_dia: [
      { fecha: "2026-07-20", total: 3, pendientes: 1, confirmadas: 2 },
      { fecha: "2026-07-21", total: 5, pendientes: 2, confirmadas: 3 },
      { fecha: "2026-07-22", total: 2, pendientes: 1, confirmadas: 1 },
      { fecha: "2026-07-23", total: 8, pendientes: 3, confirmadas: 5 },
      { fecha: "2026-07-24", total: 4, pendientes: 0, confirmadas: 4 },
    ],
    confirm_por_dia: [
      { fecha: "2026-07-20", total: 2 },
      { fecha: "2026-07-21", total: 3 },
      { fecha: "2026-07-22", total: 1 },
      { fecha: "2026-07-23", total: 5 },
      { fecha: "2026-07-24", total: 4 },
    ],
  },
  distribucion: {
    por_tipo: { comunicado: 200, citacion: 40, amonestacion: 30, felicitacion: 50, nota: 30 },
    por_rol: { Alumno: 128, Profesor: 14, Preceptor: 5 },
  },
  top_cursos: [
    { curso: "5A", notas: 60 },
    { curso: "4A", notas: 45 },
  ],
};

const TIPOS_LABEL = {
  comunicado: "Comunicado",
  citacion: "Citación",
  amonestacion: "Amonestación",
  felicitacion: "Felicitación",
  nota: "Nota",
};

const TIPOS_COLOR = {
  comunicado: "bg-blue-500",
  citacion: "bg-violet-500",
  amonestacion: "bg-rose-500",
  felicitacion: "bg-emerald-500",
  nota: "bg-cyan-600",
};

function etiquetaDia(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d)) return iso.slice(5);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

function EstadoVacio({ titulo, desc }) {
  return (
    <div className="flex h-[170px] flex-col items-center justify-center gap-1.5 text-center">
      <BarChart3 className="h-7 w-7 text-slate-300 dark:text-slate-600" aria-hidden="true" />
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{titulo}</p>
      <p className="text-xs text-slate-400 dark:text-slate-500">{desc}</p>
    </div>
  );
}

function Cargando() {
  return (
    <div className="flex h-[170px] items-center justify-center text-sm text-slate-400">Cargando…</div>
  );
}

export function DashboardView() {
  const [stats, setStats] = useState(CONECTADO_A_DJANGO ? null : MOCK_DASHBOARD);
  const [cargando, setCargando] = useState(CONECTADO_A_DJANGO);

  useEffect(() => {
    if (!CONECTADO_A_DJANGO) return;
    apiGet("/api/admin/dashboard/")
      .then(setStats)
      .catch(() => setStats(MOCK_DASHBOARD))
      .finally(() => setCargando(false));
  }, []);

  const s = stats || MOCK_DASHBOARD;
  const notasPorDia = (s.series?.notas_por_dia || []).map((d) => ({ ...d, label: etiquetaDia(d.fecha) }));
  const confPorDia = (s.series?.confirm_por_dia || []).map((d) => ({ ...d, label: etiquetaDia(d.fecha) }));
  const hayNotasPorDia = notasPorDia.some((d) => d.total > 0);
  const hayConfPorDia = confPorDia.some((d) => d.total > 0);

  const tipos = Object.entries(s.distribucion?.por_tipo || {})
    .filter(([, valor]) => valor > 0)
    .map(([clave, valor]) => ({
      clave,
      label: TIPOS_LABEL[clave] || clave,
      valor,
    }))
    .sort((a, b) => b.valor - a.valor);
  const maxTipo = Math.max(1, ...tipos.map((t) => t.valor));

  const topCursos = s.top_cursos || [];
  const maxCurso = Math.max(1, ...topCursos.map((c) => c.notas));

  const ultimoBackup = s.ultimo_backup;

  return (
    <div>
      <SectionHeading
        eyebrow={CURRENT_USER.rol}
        title="Panel de Administración"
        action={
          s.config?.modo_mantenimiento ? (
            <Badge color="rojo">Modo mantenimiento</Badge>
          ) : (
            <Badge color="verde">Sistema operativo</Badge>
          )
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Alumnos" value={s.alumnos} icon={GraduationCap} accent="cyan" loading={cargando} centrarValor />
        <StatCard label="Profesores" value={s.profesores} icon={UserCog} accent="blue" loading={cargando} />
        <StatCard label="Preceptores" value={s.preceptores} icon={UserCheck} accent="blue" loading={cargando} />
        <StatCard label="Cursos" value={s.cursos} icon={BookOpen} accent="blue" loading={cargando} />
        <StatCard label="Materias" value={s.materias} icon={Layers} accent="blue" loading={cargando} />
        <StatCard label="Notas enviadas hoy" value={s.notas_hoy} icon={Send} accent="blue" loading={cargando} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Notas pendientes"
          value={s.notas_pendientes}
          icon={Clock}
          accent={s.notas_pendientes > 0 ? "amber" : "blue"}
          loading={cargando}
          sub={s.notas_pendientes > 0 ? "Requieren atención" : "Todo al día"}
          compact
        />
        <StatCard
          label="Confirmaciones"
          value={s.notas_confirmadas}
          icon={ShieldCheck}
          accent="emerald"
          loading={cargando}
          sub={s.notas_confirmadas > 0 ? `de ${s.notas_totales} notas totales` : "Sin confirmaciones pendientes"}
          compact
        />
        <StatCard
          label="Cuentas bloqueadas"
          value={s.bloqueados}
          icon={Ban}
          accent={s.bloqueados > 0 ? "rose" : "blue"}
          loading={cargando}
          sub={s.bloqueados > 0 ? "Requieren revisión" : "Sin cuentas bloqueadas"}
          compact
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <GraficaCard title="Notas por día" sub="Últimos 14 días">
          {cargando ? (
            <Cargando />
          ) : hayNotasPorDia ? (
            <>
              <StackedBars data={notasPorDia} />
              <div className="mt-3 flex items-center justify-center gap-5 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" aria-hidden="true" />
                  Confirmadas
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" aria-hidden="true" />
                  Pendientes
                </span>
              </div>
            </>
          ) : (
            <EstadoVacio titulo="Sin comunicaciones registradas" desc="No existen datos para los últimos 14 días." />
          )}
        </GraficaCard>

        <GraficaCard title="Confirmaciones por día" sub="Últimos 14 días · PIN de responsable">
          {cargando ? (
            <Cargando />
          ) : hayConfPorDia ? (
            <StackedBars
              data={confPorDia}
              colores={{ confirmadas: "bg-cyan-600", pendientes: "bg-transparent", otras: "bg-cyan-600" }}
            />
          ) : (
            <EstadoVacio titulo="Sin confirmaciones registradas" desc="No existen datos para los últimos 14 días." />
          )}
        </GraficaCard>

        <GraficaCard title="Notas por tipo" sub="Distribución de comunicaciones">
          {cargando ? (
            <Cargando />
          ) : tipos.length ? (
            <div className="space-y-3.5">
              {tipos.map((t) => (
                <div key={t.clave}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-600 dark:text-slate-300">{t.label}</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">{t.valor}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-full rounded-full ${TIPOS_COLOR[t.clave] || "bg-cyan-600"}`}
                      style={{ width: `${(t.valor / maxTipo) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EstadoVacio titulo="Sin datos para mostrar" desc="Todavía no existen comunicaciones registradas." />
          )}
        </GraficaCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <GraficaCard title="Cursos con más comunicaciones" sub="Top 6">
          {cargando ? (
            <Cargando />
          ) : topCursos.length ? (
            <div className="space-y-2.5">
              {topCursos.map((c) => (
                <div key={c.curso} className="flex items-center gap-3">
                  <span className="w-10 shrink-0 text-sm font-semibold text-slate-700 dark:text-slate-200">{c.curso}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-cyan-700 dark:bg-cyan-500"
                      style={{ width: `${(c.notas / maxCurso) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs text-slate-500 dark:text-slate-400">{c.notas}</span>
                </div>
              ))}
            </div>
          ) : (
            <EstadoVacio titulo="Sin datos para mostrar" desc="Todavía no existen comunicaciones registradas." />
          )}
        </GraficaCard>

        <GraficaCard title="Estado del sistema" sub="Resumen operativo">
          {cargando ? (
            <Cargando />
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <Activity className="h-3.5 w-3.5" aria-hidden="true" /> Estado
                </p>
                <p className="mt-1.5 flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100">
                  <span
                    className={`h-2 w-2 rounded-full ${s.config?.modo_mantenimiento ? "bg-amber-500" : "bg-emerald-500"}`}
                    aria-hidden="true"
                  />
                  {s.config?.modo_mantenimiento ? "En mantenimiento" : "Operativo"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <DatabaseBackup className="h-3.5 w-3.5" aria-hidden="true" /> Último backup
                </p>
                {ultimoBackup ? (
                  <>
                    <p className="mt-1.5 flex items-center gap-1.5 truncate font-bold text-slate-800 dark:text-slate-100">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                      {ultimoBackup.nombre || "Backup"}
                    </p>
                    {ultimoBackup.fecha && (
                      <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">
                        {formatearFecha(ultimoBackup.fecha, true)}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-1.5 flex items-center gap-1.5 font-bold text-rose-600 dark:text-rose-400">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-hidden="true" />
                    Nunca realizado
                  </p>
                )}
              </div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Año lectivo</p>
                <p className="mt-1.5 font-bold text-slate-800 dark:text-slate-100">{s.config?.anio_lectivo || "—"}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Materias</p>
                <p className="mt-1.5 font-bold text-slate-800 dark:text-slate-100">{s.materias} activas</p>
              </div>
            </div>
          )}
        </GraficaCard>
      </div>
    </div>
  );
}
