import { useState, useEffect, useCallback } from "react";
import { Plus, PencilLine, Trash2, Search, Check } from "lucide-react";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { Modal, ConfirmDialog } from "../../components/admin/Modal";
import { Toast } from "../../components/admin/Toast";
import { Badge } from "../../components/admin/Badge";
import { apiGet, apiPost } from "../../components/admin/adminApi";
import { CURRENT_USER, CONECTADO_A_DJANGO } from "../../data/mock";
import { EmptyState } from "../../components/ui/EmptyState";

const inputClase =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

const MOCK_MATERIAS = [
  { nombre: "Base de Datos", cursos: ["6A", "6B", "7A"], profesores: ["Prof. R. Ibáñez"] },
  { nombre: "Análisis Matemático", cursos: ["5A"], profesores: ["Prof. L. Duarte"] },
];

export function MateriasView() {
  const [materias, setMaterias] = useState(CONECTADO_A_DJANGO ? [] : MOCK_MATERIAS);
  const [cursos, setCursos] = useState([]);
  const [profesores, setProfesores] = useState([]);
  const [cargando, setCargando] = useState(CONECTADO_A_DJANGO);
  const [busqueda, setBusqueda] = useState("");
  const [cursosSeleccionados, setCursosSeleccionados] = useState([]);

  const [crear, setCrear] = useState(false);
  const [editar, setEditar] = useState(null);
  const [eliminar, setEliminar] = useState(null);
  const [confirmar, setConfirmar] = useState(null);
  const [confirmarPaso, setConfirmarPaso] = useState(0);
  const [toast, setToast] = useState(null);
  const [cerrando, setCerrando] = useState(false);

  const cargar = useCallback(() => {
    if (!CONECTADO_A_DJANGO) return;
    setCargando(true);
    apiGet("/api/admin/materias/")
      .then((d) => setMaterias(d.materias || []))
      .catch(() => setMaterias([]))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!CONECTADO_A_DJANGO) return;
    apiGet("/api/cursos/").then((d) => setCursos(d.cursos || [])).catch(() => {});
    apiGet("/api/admin/usuarios/?rol=Profesor&por_pagina=100")
      .then((d) => setProfesores(d.usuarios || []))
      .catch(() => {});
  }, []);

  const materiasFiltradas = materias.filter((m) =>
    m.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  async function guardarCrear(e) {
    e.preventDefault();
    if (cursosSeleccionados.length === 0) {
      setToast({ tipo: "error", mensaje: "Seleccioná al menos un curso." });
      return;
    }
    setCerrando(true);
    const fd = new FormData(e.target);
    const materia = fd.get("materia").trim();
    try {
      for (const curso of cursosSeleccionados) {
        const gmail = fd.get(`profesor_${curso}`) || "";
        await apiPost("/api/admin/materias/guardar/", {
          accion: "asignar",
          materia,
          curso,
          gmailProfesor: gmail,
        });
      }
      setCrear(false);
      setCursosSeleccionados([]);
      setToast({ tipo: "ok", mensaje: `Materia asignada a ${cursosSeleccionados.length} curso(s).` });
      cargar();
    } catch (err) {
      setToast({ tipo: "error", mensaje: err.message });
    } finally {
      setCerrando(false);
    }
  }

  async function guardarEditar(e) {
    e.preventDefault();
    if (!editar) return;
    setCerrando(true);
    const fd = new FormData(e.target);
    const nuevoNombre = (fd.get("nombre") || "").trim();
    const cursosOriginales = materias.find((m) => m.nombre === editar.originalNombre)?.cursos || [];
    const cursosAAgregar = cursosSeleccionados.filter((c) => !cursosOriginales.includes(c));
    const cursosAEliminar = cursosOriginales.filter((c) => !cursosSeleccionados.includes(c));
    try {
      if (nuevoNombre && nuevoNombre !== editar.originalNombre) {
        await apiPost("/api/admin/materias/guardar/", {
          accion: "renombrar",
          materia: editar.originalNombre,
          nueva: nuevoNombre,
        });
      }
      for (const curso of cursosAAgregar) {
        const gmail = fd.get(`profesor_${curso}`) || "";
        await apiPost("/api/admin/materias/guardar/", {
          accion: "asignar",
          materia: nuevoNombre || editar.originalNombre,
          curso,
          gmailProfesor: gmail,
        });
      }
      for (const curso of cursosOriginales.filter((c) => cursosSeleccionados.includes(c))) {
        const gmail = fd.get(`profesor_${curso}`) || "";
        const gmailOriginal = editar.cursosProfesor[curso] || "";
        if (gmail !== gmailOriginal) {
          await apiPost("/api/admin/materias/guardar/", {
            accion: "asignar",
            materia: nuevoNombre || editar.originalNombre,
            curso,
            gmailProfesor: gmail,
          });
        }
      }
      for (const curso of cursosAEliminar) {
        await apiPost("/api/admin/materias/guardar/", {
          accion: "eliminar",
          materia: nuevoNombre || editar.originalNombre,
          curso,
        });
      }
      setEditar(null);
      setCursosSeleccionados([]);
      setToast({ tipo: "ok", mensaje: "Materia actualizada." });
      cargar();
    } catch (err) {
      setToast({ tipo: "error", mensaje: err.message });
    } finally {
      setCerrando(false);
    }
  }

  async function ejecutarEliminar() {
    if (!confirmar) return;
    if (confirmarPaso < 3) {
      setConfirmarPaso(confirmarPaso + 1);
      return;
    }
    setCerrando(true);
    try {
      for (const curso of eliminar.cursos) {
        await apiPost("/api/admin/materias/guardar/", {
          accion: "eliminar",
          materia: eliminar.nombre,
          curso,
        });
      }
      setEliminar(null);
      setConfirmar(null);
      setConfirmarPaso(0);
      setToast({ tipo: "ok", mensaje: `"${eliminar.nombre}" fue eliminada correctamente.` });
      cargar();
    } catch (err) {
      setToast({ tipo: "error", mensaje: err.message });
      setConfirmar(null);
      setConfirmarPaso(0);
    } finally {
      setCerrando(false);
    }
  }

  function abrirEditar(m) {
    const mapa = {};
    if (m.asignaciones && m.asignaciones.length > 0) {
      m.asignaciones.forEach((a) => {
        mapa[a.curso] = a.gmailProfesor || "";
      });
    } else {
      const gmailDefault = m.profesores.length > 0
        ? (profesores.find((p) => m.profesores.includes(p.nombre))?.gmail || "")
        : "";
      m.cursos.forEach((c) => { mapa[c] = gmailDefault; });
    }
    setEditar({
      originalNombre: m.nombre,
      nombre: m.nombre,
      cursosProfesor: mapa,
    });
    setCursosSeleccionados([...m.cursos]);
  }

  return (
    <div>
      <SectionHeading
        eyebrow={CURRENT_USER.rol}
        title="Materias"
        action={
          <button onClick={() => setCrear(true)} className="flex items-center gap-2 rounded-lg bg-cyan-700 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-800">
            <Plus className="h-4 w-4" />
            Nueva materia
          </button>
        }
      />

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar materia..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none transition-colors focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      {cargando ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-3 h-5 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="mb-3 flex gap-2">
                <div className="h-6 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
                <div className="h-6 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
              </div>
              <div className="h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
            </div>
          ))}
        </div>
      ) : materiasFiltradas.length === 0 ? (
        <EmptyState
          icon={busqueda ? Search : Plus}
          title={busqueda ? "Sin resultados" : "Sin materias cargadas"}
          description={busqueda ? "No se encontraron materias con ese nombre." : "Asigná una materia a un curso y un profesor."}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {materiasFiltradas.map((m) => (
            <div key={m.nombre} className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-3 flex items-start justify-between gap-3">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{m.nombre}</h3>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {m.cantCursos} curso{m.cantCursos !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="mb-3 flex flex-wrap gap-1.5">
                {m.cursos.map((c) => (
                  <Badge key={c} color="azul">{c}</Badge>
                ))}
                {!m.cursos.length && (
                  <span className="text-xs text-slate-400 italic">Sin asignar</span>
                )}
              </div>

              <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                {m.profesores.length > 0 ? m.profesores.join(", ") : "Sin profesor asignado"}
              </p>

              <div className="flex items-center gap-1 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  onClick={() => abrirEditar(m)}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-cyan-50 hover:text-cyan-700 dark:text-slate-400 dark:hover:bg-cyan-900/30 dark:hover:text-cyan-300"
                >
                  <PencilLine className="h-3.5 w-3.5" />
                  Editar
                </button>
                <button
                  onClick={() => { setEliminar(m); setConfirmar({ accion: "eliminar", materia: m }); setConfirmarPaso(1); }}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-900/30 dark:hover:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={crear} onClose={() => !cerrando && (setCrear(false), setCursosSeleccionados([]))} title="Nueva materia" subtitle="Seleccioná uno o varios cursos y asignale un profesor.">
        <form onSubmit={guardarCrear} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Nombre de la materia</label>
            <input name="materia" required className={inputClase} placeholder="Programación" />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Cursos <span className="text-slate-400 normal-case">({cursosSeleccionados.length} seleccionado{cursosSeleccionados.length !== 1 ? "s" : ""})</span>
            </label>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {cursos.map((c) => {
                const activo = cursosSeleccionados.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCursosSeleccionados((prev) => activo ? prev.filter((x) => x !== c) : [...prev, c])}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                      activo
                        ? "border-cyan-600 bg-cyan-50 text-cyan-700 ring-2 ring-cyan-600/20 dark:border-cyan-500 dark:bg-cyan-900/30 dark:text-cyan-300"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600"
                    }`}
                  >
                    {activo && <Check className="h-3.5 w-3.5" />}
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Profesor por curso</label>
            {cursosSeleccionados.map((c) => (
              <div key={c} className="flex items-center gap-2">
                <span className="shrink-0 w-12 rounded-lg bg-slate-100 px-2 py-1.5 text-center text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{c}</span>
                <select name={`profesor_${c}`} className={inputClase} defaultValue="">
                  <option value="">Sin profesor</option>
                  {profesores.map((p) => (
                    <option key={p.gmail} value={p.gmail}>{p.nombre}</option>
                  ))}
                </select>
              </div>
            ))}
            {cursosSeleccionados.length === 0 && (
              <p className="text-xs text-slate-400 italic">Seleccioná cursos arriba para asignar profesores.</p>
            )}
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={cerrando} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50">
              {cerrando ? "Guardando…" : "Crear materia"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editar} onClose={() => !cerrando && (setEditar(null), setCursosSeleccionados([]))} title="Editar materia" subtitle="Modificá el nombre, los cursos asignados o el profesor.">
        <form onSubmit={guardarEditar} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Nombre de la materia</label>
            <input name="nombre" required className={inputClase} defaultValue={editar?.nombre || ""} />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Cursos <span className="text-slate-400 normal-case">({cursosSeleccionados.length} seleccionado{cursosSeleccionados.length !== 1 ? "s" : ""})</span>
            </label>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {cursos.map((c) => {
                const activo = cursosSeleccionados.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCursosSeleccionados((prev) => activo ? prev.filter((x) => x !== c) : [...prev, c])}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                      activo
                        ? "border-cyan-600 bg-cyan-50 text-cyan-700 ring-2 ring-cyan-600/20 dark:border-cyan-500 dark:bg-cyan-900/30 dark:text-cyan-300"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600"
                    }`}
                  >
                    {activo && <Check className="h-3.5 w-3.5" />}
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Profesor por curso</label>
            {cursosSeleccionados.map((c) => (
              <div key={c} className="flex items-center gap-2">
                <span className="shrink-0 w-12 rounded-lg bg-slate-100 px-2 py-1.5 text-center text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{c}</span>
                <select name={`profesor_${c}`} className={inputClase} defaultValue={editar?.cursosProfesor?.[c] || ""}>
                  <option value="">Sin profesor</option>
                  {profesores.map((p) => (
                    <option key={p.gmail} value={p.gmail}>{p.nombre}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={cerrando} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50">
              {cerrando ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!confirmar}
        onClose={() => !cerrando && (setConfirmar(null), setConfirmarPaso(0))}
        onConfirm={ejecutarEliminar}
        cargando={cerrando}
        title={
          confirmarPaso === 3 ? "Última confirmación" :
          confirmarPaso === 2 ? "¿Estás seguro?" :
          "Eliminar materia"
        }
        text={
          confirmarPaso === 3
            ? `Se eliminará "${eliminar?.nombre}" de todos sus cursos (${eliminar?.cursos.join(", ")}). Esta acción no se puede deshacer.`
            : confirmarPaso === 2
              ? `Vas a eliminar la materia "${eliminar?.nombre}" de ${eliminar?.cursos.length} curso(s). Todos los datos de asignación serán borrados permanentemente.`
              : `Estás por eliminar la materia "${eliminar?.nombre}" de todos sus cursos (${eliminar?.cursos.join(", ")}). Las calificaciones guardadas se conservarán. ¿Deseás continuar?`
        }
        confirmLabel={
          confirmarPaso === 3 ? "Sí, eliminar definitivamente" :
          confirmarPaso === 2 ? "Estoy seguro" :
          "Continuar"
        }
        danger
      />

      <Toast mensaje={toast?.mensaje} tipo={toast?.tipo} onClose={() => setToast(null)} />
    </div>
  );
}
