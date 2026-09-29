import { useState, useEffect, useCallback } from "react";
import { Plus, Copy, PencilLine, Power, Users, Layers, ShieldCheck, Clock, GraduationCap, BookOpen, UserCog, KeyRound } from "lucide-react";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { Modal, ConfirmDialog } from "../../components/admin/Modal";
import { Toast } from "../../components/admin/Toast";
import { Badge } from "../../components/admin/Badge";
import { AdminTable } from "../../components/admin/AdminTable";
import { apiGet, apiPost } from "../../components/admin/adminApi";
import { CURRENT_USER, CONECTADO_A_DJANGO } from "../../data/mock";

const inputClase =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

const MOCK_CURSOS = [
  { _id: "1", nombre: "5A", especialidad: "Informática", anio_lectivo: "2026", alumnos: 24, cantMaterias: 12, materias: ["Base de Datos", "Programación"], profesores: ["Prof. R. Ibáñez"], preceptores: ["María López"], notasTotal: 40, notasPendientes: 5, notasConfirmadas: 35, activo: true },
  { _id: "2", nombre: "7A", especialidad: "Informática", anio_lectivo: "2026", alumnos: 22, cantMaterias: 12, materias: ["Base de Datos"], profesores: ["Prof. R. Ibáñez"], preceptores: ["María López"], notasTotal: 60, notasPendientes: 8, notasConfirmadas: 52, activo: true },
];

const MOCK_DETALLE_ALUMNOS = [
  { gmail: "48379007@insi.edu.ar", numero: 48379007, nombre: "Lucas Martín Acevedo", estado: "Activo", pin: { tiene: true, habilitado: true } },
  { gmail: "martina.gomez@insi.edu.ar", numero: 28901123, nombre: "Martina Gómez", estado: "Activo", pin: { tiene: false } },
];

const tabClase = (activa) =>
  `rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
    activa
      ? "bg-cyan-700 text-white"
      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
  }`;

function FormCurso({ inicial, onGuardar, cerrando }) {
  const [form, setForm] = useState({
    nombre: inicial?.nombre || "",
    especialidad: inicial?.especialidad || "",
    anio_lectivo: inicial?.anio_lectivo || String(new Date().getFullYear()),
  });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.nombre.trim()) return setErr("Falta el nombre del curso.");
        onGuardar(form);
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Nombre</label>
          <input className={inputClase} value={form.nombre} onChange={set("nombre")} placeholder="5A" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Especialidad</label>
          <input className={inputClase} value={form.especialidad} onChange={set("especialidad")} placeholder="Informática" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Año lectivo</label>
          <input className={inputClase} value={form.anio_lectivo} onChange={set("anio_lectivo")} />
        </div>
      </div>
      {err && <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{err}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={cerrando} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-800 disabled:opacity-50">
          {cerrando ? "Guardando…" : inicial ? "Guardar cambios" : "Crear curso"}
        </button>
      </div>
    </form>
  );
}

export function CursosView() {
  const [cursos, setCursos] = useState(CONECTADO_A_DJANGO ? [] : MOCK_CURSOS);
  const [cargando, setCargando] = useState(CONECTADO_A_DJANGO);
  const [crear, setCrear] = useState(false);
  const [editando, setEditando] = useState(null);
  const [duplicando, setDuplicando] = useState(null);
  const [confirmar, setConfirmar] = useState(null);
  const [toast, setToast] = useState(null);
  const [cerrando, setCerrando] = useState(false);

  const [detalle, setDetalle] = useState(null);
  const [detalleData, setDetalleData] = useState(null);
  const [tabDetalle, setTabDetalle] = useState("alumnos");
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const [pinNuevo, setPinNuevo] = useState(null);
  const [generandoPines, setGenerandoPines] = useState(false);

  const cargar = useCallback(() => {
    if (!CONECTADO_A_DJANGO) return;
    setCargando(true);
    apiGet("/api/admin/cursos/")
      .then((d) => setCursos(d.cursos || []))
      .catch(() => setCursos([]))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function abrirDetalle(curso) {
    setDetalle(curso);
    setTabDetalle("alumnos");
    setDetalleData(null);
    if (!CONECTADO_A_DJANGO) {
      setDetalleData({
        curso,
        alumnos: MOCK_DETALLE_ALUMNOS,
        materias: (curso.materias || []).map((m) => ({ nombre: m, profesores: [] })),
        preceptores: curso.preceptores || [],
      });
      return;
    }
    setCargandoDetalle(true);
    apiGet(`/api/admin/cursos/detalle/?id=${curso._id}`)
      .then((d) => setDetalleData(d))
      .catch((e) => setToast({ tipo: "error", mensaje: e.message }))
      .finally(() => setCargandoDetalle(false));
  }

  function cargarDetalle() {
    if (!detalle || !CONECTADO_A_DJANGO) return;
    apiGet(`/api/admin/cursos/detalle/?id=${detalle._id}`)
      .then((d) => setDetalleData(d))
      .catch(() => {});
  }

  async function generarPin(alumno) {
    if (!CONECTADO_A_DJANGO) {
      setPinNuevo({ nombre: alumno.nombre, pin: "12345678" });
      return;
    }
    setGenerandoPines(true);
    try {
      const res = await apiPost("/api/admin/pin/accion/", { gmail: alumno.gmail, accion: "regenerar" });
      setPinNuevo({ nombre: alumno.nombre, pin: res.pin });
      cargarDetalle();
    } catch (e) {
      setToast({ tipo: "error", mensaje: e.message });
    } finally {
      setGenerandoPines(false);
    }
  }

  async function generarPinesTodos() {
    const sinPin = detalleData?.alumnos?.filter((a) => !a.pin?.tiene) || [];
    if (!sinPin.length) {
      setToast({ tipo: "ok", mensaje: "Todos los alumnos ya tienen PIN." });
      return;
    }
    setGenerandoPines(true);
    let ok = 0;
    for (const a of sinPin) {
      try {
        await apiPost("/api/admin/pin/accion/", { gmail: a.gmail, accion: "regenerar" });
        ok += 1;
      } catch (e) {
        setToast({ tipo: "error", mensaje: `${a.nombre}: ${e.message}` });
        break;
      }
    }
    setGenerandoPines(false);
    setToast({ tipo: "ok", mensaje: `${ok} de ${sinPin.length} PINs generados.` });
    cargarDetalle();
  }

  async function guardar(form) {
    setCerrando(true);
    try {
      await apiPost("/api/admin/cursos/guardar/", { ...form, _id: editando?._id });
      setCrear(false);
      setEditando(null);
      setToast({ tipo: "ok", mensaje: "Curso guardado." });
      cargar();
    } catch (e) {
      setToast({ tipo: "error", mensaje: e.message });
    } finally {
      setCerrando(false);
    }
  }

  async function ejecutar() {
    if (!confirmar) return;
    setCerrando(true);
    const { accion, curso } = confirmar;
    try {
      if (accion === "duplicar") {
        const nombre = (duplicando?.nombre || "").trim();
        if (!nombre) throw new Error("Falta el nombre del curso nuevo.");
        await apiPost("/api/admin/cursos/accion/", { _id: curso._id, accion, nuevoNombre: nombre });
      } else {
        await apiPost("/api/admin/cursos/accion/", { _id: curso._id, accion });
      }
      setConfirmar(null);
      setDuplicando(null);
      cargar();
    } catch (e) {
      setToast({ tipo: "error", mensaje: e.message });
      setConfirmar(null);
      setDuplicando(null);
    } finally {
      setCerrando(false);
    }
  }

  const columnasAlumnos = [
    { key: "nombre", label: "Alumno", render: (a) => (
        <div>
          <p className="font-semibold text-slate-800 dark:text-slate-100">{a.nombre}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">{a.gmail}</p>
        </div>
      ) },
    { key: "numero", label: "DNI / Legajo", render: (a) => a.numero ?? "—" },
    { key: "pin", label: "PIN", render: (a) => (
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${a.pin?.habilitado ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
          <ShieldCheck className="h-3.5 w-3.5" />
          {a.pin?.tiene ? (a.pin.habilitado ? "Configurado" : "Deshabilitado") : "Sin PIN"}
        </span>
      ) },
    { key: "estado", label: "Estado", render: (a) => (
        <Badge color={a.estado === "Activo" ? "verde" : "gris"}>{a.estado}</Badge>
      ) },
    { key: "acciones", label: "", className: "text-right", render: (a) => (
        <button
          onClick={() => generarPin(a)}
          disabled={generandoPines}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-cyan-700 transition-colors hover:bg-cyan-50 disabled:opacity-50 dark:text-cyan-300 dark:hover:bg-cyan-900/40"
          aria-label="Generar PIN"
        >
          <KeyRound className="h-3.5 w-3.5" />
          {a.pin?.tiene ? "Regenerar" : "Generar PIN"}
        </button>
      ) },
  ];

  return (
    <div>
      <SectionHeading
        eyebrow={CURRENT_USER.rol}
        title="Cursos"
        action={
          <button
            onClick={() => setCrear(true)}
            className="flex items-center gap-2 rounded-lg bg-cyan-700 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-800"
          >
            <Plus className="h-4 w-4" />
            Nuevo curso
          </button>
        }
      />

      {cargando ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cursos.map((c) => (
            <div key={c._id} onClick={() => abrirDetalle(c)} className="cursor-pointer rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-700/10 text-base font-bold text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300">
                    {c.nombre}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 dark:text-slate-100">{c.nombre}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{c.especialidad || "Sin especialidad"} · {c.anio_lectivo}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={(e) => { e.stopPropagation(); setEditando(c); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-cyan-700 dark:hover:bg-slate-800 dark:hover:text-cyan-300" aria-label="Editar">
                    <PencilLine className="h-4 w-4" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setDuplicando({ curso: c, nombre: `${c.nombre}N` }); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-cyan-700 dark:hover:bg-slate-800 dark:hover:text-cyan-300" aria-label="Duplicar">
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmar({ accion: c.activo ? "desactivar" : "activar", curso: c }); }}
                    className={`rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 ${c.activo ? "text-emerald-600" : "text-slate-400"}`}
                    aria-label={c.activo ? "Desactivar" : "Activar"}
                  >
                    <Power className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 py-2 dark:bg-slate-800/60">
                  <p className="flex items-center justify-center gap-1 text-sm font-bold text-slate-800 dark:text-slate-100"><Users className="h-3.5 w-3.5 text-cyan-600" />{c.alumnos}</p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Alumnos</p>
                </div>
                <div className="rounded-lg bg-slate-50 py-2 dark:bg-slate-800/60">
                  <p className="flex items-center justify-center gap-1 text-sm font-bold text-slate-800 dark:text-slate-100"><Layers className="h-3.5 w-3.5 text-blue-600" />{c.cantMaterias}</p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Materias</p>
                </div>
                <div className="rounded-lg bg-slate-50 py-2 dark:bg-slate-800/60">
                  <p className="flex items-center justify-center gap-1 text-sm font-bold text-slate-800 dark:text-slate-100"><Clock className="h-3.5 w-3.5 text-amber-600" />{c.notasPendientes}</p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Pendientes</p>
                </div>
              </div>

              <div className="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                <p className="truncate"><span className="font-semibold text-slate-600 dark:text-slate-300">Preceptor:</span> {c.preceptores?.[0] || "Sin asignar"}</p>
                <p className="truncate"><span className="font-semibold text-slate-600 dark:text-slate-300">Notas:</span> {c.notasTotal} enviadas · {c.notasConfirmadas} confirmadas</p>
                <div className="flex flex-wrap gap-1 pt-1">
                  {c.materias?.slice(0, 3).map((m) => (
                    <span key={m} className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">{m}</span>
                  ))}
                  {(c.cantMaterias || 0) > 3 && <span className="text-[10px] text-slate-400">+{(c.cantMaterias || 0) - 3}</span>}
                </div>
              </div>

              <div className="mt-3">
                {c.activo ? <Badge color="verde"><ShieldCheck className="mr-1 h-3 w-3" />Activo</Badge> : <Badge color="gris">Inactivo</Badge>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={crear} onClose={() => !cerrando && setCrear(false)} title="Nuevo curso" subtitle="Creá el curso y después asigná materias y profesores.">
        <FormCurso cerrando={cerrando} onGuardar={guardar} />
      </Modal>

      <Modal open={!!editando} onClose={() => !cerrando && setEditando(null)} title="Editar curso" subtitle={editando?.nombre}>
        {editando && <FormCurso inicial={editando} cerrando={cerrando} onGuardar={guardar} />}
      </Modal>

      <Modal
        open={!!duplicando}
        onClose={() => !cerrando && setDuplicando(null)}
        title="Duplicar curso"
        subtitle={`Crea una copia de ${duplicando?.curso.nombre} (sin alumnos ni notas, solo la base).`}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Nombre del curso nuevo</label>
            <input
              className={inputClase}
              value={duplicando?.nombre || ""}
              onChange={(e) => setDuplicando((d) => ({ ...d, nombre: e.target.value }))}
              placeholder="5B"
            />
          </div>
          <div className="flex justify-end">
            <button onClick={ejecutar} disabled={cerrando} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50">
              {cerrando ? "Creando…" : "Duplicar curso"}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmar}
        onClose={() => !cerrando && setConfirmar(null)}
        onConfirm={ejecutar}
        cargando={cerrando}
        title={confirmar?.accion === "desactivar" ? "Desactivar curso" : "Activar curso"}
        text={confirmar?.accion === "desactivar" ? `El curso ${confirmar?.curso.nombre} dejará de aparecer en los selectores. Sus datos no se borran.` : `El curso ${confirmar?.curso.nombre} volverá a estar activo.`}
        danger={confirmar?.accion === "desactivar"}
        confirmLabel={confirmar?.accion === "desactivar" ? "Desactivar" : "Activar"}
      />

      <Modal
        open={!!detalle}
        onClose={() => !cargandoDetalle && setDetalle(null)}
        title={`Curso ${detalle?.nombre || ""}`}
        subtitle={
          detalleData?.curso
            ? `${detalleData.curso.especialidad || "Sin especialidad"} · Año ${detalleData.curso.anio_lectivo || ""}`
            : "Detalle del curso"
        }
        size="xl"
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <button onClick={() => setTabDetalle("alumnos")} className={tabClase(tabDetalle === "alumnos")}>
            <GraduationCap className="mr-1 inline h-4 w-4" />Alumnos ({detalleData ? detalleData.alumnos.length : "…"})
          </button>
          <button onClick={() => setTabDetalle("materias")} className={tabClase(tabDetalle === "materias")}>
            <BookOpen className="mr-1 inline h-4 w-4" />Materias ({detalleData ? detalleData.materias.length : "…"})
          </button>
          <button onClick={() => setTabDetalle("preceptores")} className={tabClase(tabDetalle === "preceptores")}>
            <UserCog className="mr-1 inline h-4 w-4" />Preceptores ({detalleData ? detalleData.preceptores.length : "…"})
          </button>
        </div>

        {cargandoDetalle ? (
          <div className="py-10 text-center text-sm text-slate-400">Cargando detalle del curso…</div>
        ) : !detalleData ? null : tabDetalle === "alumnos" ? (
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {detalleData.alumnos.filter((a) => !a.pin?.tiene).length || 0} alumnos sin PIN
              </p>
              <button
                onClick={generarPinesTodos}
                disabled={generandoPines || !CONECTADO_A_DJANGO}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-800 disabled:opacity-50"
              >
                <KeyRound className="h-4 w-4" />
                {generandoPines ? "Generando…" : "Generar PIN para todos"}
              </button>
            </div>
            <AdminTable
              columns={columnasAlumnos}
              rows={detalleData.alumnos}
              rowKey={(a) => a.gmail}
              empty={{ title: "Sin alumnos", text: "Todavía no hay alumnos cargados en este curso." }}
            />
          </div>
        ) : tabDetalle === "materias" ? (
          detalleData.materias.length ? (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {detalleData.materias.map((m) => (
                <div key={m.nombre} className="flex items-center justify-between gap-3 px-4 py-3">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{m.nombre}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {m.profesores?.length ? m.profesores.join(", ") : "Sin profesor asignado"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-slate-400">Este curso todavía no tiene materias asignadas.</p>
          )
        ) : detalleData.preceptores.length ? (
          <div className="flex flex-wrap gap-2">
            {detalleData.preceptores.map((p) => (
              <Badge key={p} color="violeta">{p}</Badge>
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-slate-400">Este curso no tiene preceptor asignado.</p>
        )}
      </Modal>

      <Modal
        open={!!pinNuevo}
        onClose={() => setPinNuevo(null)}
        title="PIN del responsable"
        subtitle={`Mostralo al responsable de ${pinNuevo?.nombre || "la familia"} — se muestra una sola vez.`}
      >
        <div className="rounded-xl border-2 border-dashed border-cyan-600 bg-cyan-50 p-6 text-center dark:bg-cyan-900/30">
          <p className="text-3xl font-bold tracking-[0.3em] text-cyan-800 dark:text-cyan-200">{pinNuevo?.pin}</p>
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
