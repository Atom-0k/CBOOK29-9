import { useState, useEffect, useCallback } from "react";
import { Search, ShieldCheck } from "lucide-react";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { AdminTable } from "../../components/admin/AdminTable";
import { Badge, badgePorTipoNota } from "../../components/admin/Badge";
import { apiGet, formatearFecha } from "../../components/admin/adminApi";
import { CURRENT_USER, CONECTADO_A_DJANGO } from "../../data/mock";

const inputClase =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

export function ConfirmacionesView() {
  const [confirmaciones, setConfirmaciones] = useState([]);
  const [cursos, setCursos] = useState([]);
  const [cargando, setCargando] = useState(CONECTADO_A_DJANGO);
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [curso, setCurso] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const cargar = useCallback(() => {
    if (!CONECTADO_A_DJANGO) return;
    setCargando(true);
    const params = new URLSearchParams({ pagina, curso, busqueda });
    apiGet(`/api/admin/confirmaciones/?${params}`)
      .then((d) => {
        setConfirmaciones(d.confirmaciones || []);
        setPaginas(d.paginas || 1);
        setTotal(d.total || 0);
      })
      .catch(() => setConfirmaciones([]))
      .finally(() => setCargando(false));
  }, [pagina, curso, busqueda]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    setPagina(1);
  }, [curso, busqueda]);

  useEffect(() => {
    if (!CONECTADO_A_DJANGO) return;
    apiGet("/api/cursos/").then((d) => setCursos(d.cursos || [])).catch(() => {});
  }, []);

  const columnas = [
    { key: "titulo", label: "Comunicación", render: (c) => <p className="font-semibold text-slate-800 dark:text-slate-100">{c.titulo}</p> },
    { key: "tipo", label: "Tipo", render: (c) => { const b = badgePorTipoNota(c.tipo); return <Badge color={b.color}>{b.label}</Badge>; } },
    { key: "alumno", label: "Alumno", render: (c) => <span className="text-xs text-slate-600 dark:text-slate-300">{c.alumno}</span> },
    { key: "curso", label: "Curso", render: (c) => <Badge color="azul">{c.curso || "—"}</Badge> },
    { key: "fechaEnvio", label: "Enviada", render: (c) => <span className="text-xs text-slate-500 dark:text-slate-400">{formatearFecha(c.fechaEnvio, true)}</span> },
    { key: "fechaConfirmacion", label: "Confirmada", render: (c) => <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{formatearFecha(c.fechaConfirmacion, true)}</span> },
    { key: "metodo", label: "Método", render: () => (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 dark:text-cyan-300">
          <ShieldCheck className="h-3.5 w-3.5" /> PIN
        </span>
      ),
    },
  ];

  return (
    <div>
      <SectionHeading eyebrow={CURRENT_USER.rol} title="Confirmaciones" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por comunicación o alumno…" className={`${inputClase} pl-9`} />
        </div>
        <select value={curso} onChange={(e) => setCurso(e.target.value)} className={inputClase + " w-auto"}>
          <option value="">Todos los cursos</option>
          {cursos.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <AdminTable
        columns={columnas}
        rows={confirmaciones}
        rowKey={(c) => c.id}
        loading={cargando}
        pagination={{ pagina, paginas, total, onChange: setPagina }}
        empty={{ title: "Todavía no hay confirmaciones", text: "Cuando los responsables confirmen una nota con el PIN, aparecerá acá." }}
      />
    </div>
  );
}
