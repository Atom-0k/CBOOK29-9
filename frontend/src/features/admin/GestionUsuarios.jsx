import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, Search, MoreVertical, PencilLine, UserMinus, UserCheck, Lock, Unlock, KeyRound, ShieldCheck, History } from "lucide-react";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { AdminTable } from "../../components/admin/AdminTable";
import { Modal, ConfirmDialog } from "../../components/admin/Modal";
import { Toast } from "../../components/admin/Toast";
import { Badge, badgePorEstado } from "../../components/admin/Badge";
import { apiGet, apiPost, formatearFecha, hoyIso } from "../../components/admin/adminApi";
import { CURRENT_USER, CONECTADO_A_DJANGO } from "../../data/mock";
import { ModalEstado } from "./ModalEstado";
import { ModalHistorial } from "./ModalHistorial";

const MOCK_USUARIOS = [];

const LABELS = {
  Alumno: { titulo: "Alumnos", singular: "alumno", plural: "alumnos" },
  Profesor: { titulo: "Profesores", singular: "profesor", plural: "profesores" },
  Preceptor: { titulo: "Preceptores", singular: "preceptor", plural: "preceptores" },
};

const inputClase =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const selectClase =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-cyan-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

function Filtros({ busqueda, setBusqueda, curso, setCurso, estado, setEstado, cursos, tipo }) {
  const opcionesEstado =
    tipo === "Alumno"
      ? [
          ["no_baja", "Activos y bloqueados"],
          ["Activo", "Solo activos"],
          ["Bloqueado", "Bloqueados"],
          ["Baja", "Dado de baja"],
          ["", "Todos los estados"],
        ]
      : [
          ["", "Todos los estados"],
          ["Activo", "Activos"],
          ["Bloqueado", "Bloqueados"],
          ["Baja", "De baja"],
        ];
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, DNI o Gmail…"
          className={`${inputClase} pl-9`}
        />
      </div>
      <select value={curso} onChange={(e) => setCurso(e.target.value)} className={selectClase}>
        <option value="">Todos los cursos</option>
        {cursos.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <select value={estado} onChange={(e) => setEstado(e.target.value)} className={selectClase}>
        {opcionesEstado.map(([valor, label]) => (
          <option key={valor} value={valor}>{label}</option>
        ))}
      </select>
    </div>
  );
}

function FormularioUsuario({ tipo, inicial, cursos, onGuardar, cerrando }) {
  const [form, setForm] = useState(() => ({
    apellido: inicial?.apellido || "",
    nombres: inicial?.nombres || "",
    gmail: inicial?.gmail || "",
    numero: inicial?.numero ?? "",
    curso: inicial?.cursos?.[0] || inicial?.curso || "",
    turno: inicial?.turno || "",
    emailTutor: inicial?.emailTutor || "",
    password: "",
  }));
  const [err, setErr] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function guardar(e) {
    e.preventDefault();
    setErr("");
    if (!form.apellido.trim() || !form.nombres.trim()) {
      setErr("Completá apellido y nombres.");
      return;
    }
    if (tipo === "Alumno" && !form.curso) {
      setErr("Seleccioná el curso del alumno.");
      return;
    }
    if (form.emailTutor.trim() && !/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(form.emailTutor.trim())) {
      setErr("El Gmail del tutor no es un correo válido.");
      return;
    }
    onGuardar({ ...form, apellido: form.apellido.trim(), nombres: form.nombres.trim(), gmail: form.gmail.trim(), emailTutor: form.emailTutor.trim(), password: form.password.trim() });
  }

  return (
    <form onSubmit={guardar} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Apellido</label>
          <input className={inputClase} value={form.apellido} onChange={set("apellido")} placeholder="Gómez" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Nombres</label>
          <input className={inputClase} value={form.nombres} onChange={set("nombres")} placeholder="Martina" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Gmail <span className="normal-case font-normal">(si ponés solo el número, se agrega @insi.edu.ar)</span>
          </label>
          <input className={inputClase} value={form.gmail} onChange={set("gmail")} placeholder="48379007@insi.edu.ar" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">DNI / Legajo</label>
          <input className={inputClase} value={form.numero} onChange={set("numero")} placeholder="48379007" inputMode="numeric" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Curso</label>
          <select className={inputClase} value={form.curso} onChange={set("curso")}>
            <option value="">
              {tipo === "Profesor" ? "Sin curso fijo (se asigna por materia)" : "Seleccionar curso…"}
            </option>
            {cursos.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        {!inicial && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Contraseña <span className="normal-case font-normal">(opcional, default 1234)</span>
            </label>
            <input className={inputClase} value={form.password} onChange={set("password")} placeholder="1234" />
          </div>
        )}
        {tipo === "Alumno" && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Turno <span className="normal-case font-normal">(para el cálculo de inasistencias)</span>
            </label>
            <select className={inputClase} value={form.turno} onChange={set("turno")}>
              <option value="Mañana">Mañana (1 turno)</option>
              <option value="Tarde">Tarde (1 turno)</option>
              <option value="Doble turno">Doble turno (0,5 por turno)</option>
              <option value="Contraturno">Contraturno (0,5 por turno)</option>
            </select>
          </div>
        )}
      </div>
      {tipo === "Alumno" && (
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Gmail del tutor <span className="normal-case font-normal">(se le avisa por correo cuando el alumno falta)</span>
          </label>
          <input
            className={inputClase}
            type="email"
            value={form.emailTutor}
            onChange={set("emailTutor")}
            placeholder="tutor@ejemplo.com"
          />
        </div>
      )}
      {err && <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{err}</p>}
      <div className="flex justify-end gap-3">
        <button
          type="submit"
          disabled={cerrando}
          className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-800 disabled:opacity-50"
        >
          {cerrando ? "Guardando…" : inicial ? "Guardar cambios" : "Crear " + LABELS[tipo].singular}
        </button>
      </div>
    </form>
  );
}

function MenuAcciones({ usuario, tipo, onAccion }) {
  const [abierto, setAbierto] = useState(false);
  const btnRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const estaActivo = usuario.estado === "Activo";

  // El menú se renderiza como popover "fixed" fuera del contenedor de la
  // tabla (que tiene overflow:hidden), así nunca se recorta y siempre entra
  // en la pantalla sin necesidad de hacer scroll.
  useLayoutEffect(() => {
    if (!abierto || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const anchoMenu = 240;
    const altoItem = 38;
    const items = (() => {
      let n = 1; // editar
      if (estaActivo) n += 2; // bloquear + baja
      else if (usuario.estado === "Bloqueado") n += 1; // desbloquear
      else if (usuario.estado === "Baja") n += 1; // reactivar
      if (tipo === "Alumno") n += 1; // pin
      n += 1; // pass
      n += 1; // historial de estados
      return n;
    })();
    const altoMenu = items * altoItem + 16;
    let top = r.bottom + 8;
    let left = r.right - anchoMenu;
    // Si no cabe abajo, abre hacia arriba.
    if (top + altoMenu > window.innerHeight && r.bottom < r.top + altoMenu) {
      top = Math.max(8, r.top - altoMenu - 8);
    }
    // Si no cabe a la derecha, alinea al borde izquierdo del botón.
    if (left < 8) left = Math.max(8, r.left);
    setPos({ top, left });
  }, [abierto, estaActivo, usuario.estado, tipo]);

  const items = [];
  items.push({ id: "editar", label: "Editar", icon: PencilLine });
  if (estaActivo) {
    items.push({ id: "bloquear", label: "Bloquear cuenta", icon: Lock });
    items.push({ id: "baja", label: "Dar de baja", icon: UserMinus, danger: true });
  } else if (usuario.estado === "Bloqueado") {
    items.push({ id: "desbloquear", label: "Desbloquear", icon: Unlock });
  } else if (usuario.estado === "Baja") {
    items.push({ id: "reactivar", label: "Reactivar", icon: UserCheck });
  }
  if (tipo === "Alumno") {
    items.push({ id: "pin", label: usuario.pin?.tiene ? "Regenerar PIN" : "Generar PIN", icon: ShieldCheck });
  }
  items.push({ id: "pass", label: "Restablecer contraseña", icon: KeyRound });
  items.push({ id: "historial", label: "Historial de estados", icon: History });

  function renderFuera() {
    if (!abierto) return null;
    const cerrar = () => setAbierto(false);
    return createPortal(
      <div className="fixed inset-0 z-40" onClick={cerrar}>
        <div
          className="fixed z-50 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800"
          style={{ top: `${pos.top}px`, left: `${pos.left}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <button
                key={it.id}
                onClick={() => { cerrar(); onAccion(it.id, usuario); }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  it.danger
                    ? "text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/30"
                    : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/50"
                }`}
              >
                <Icon className="h-4 w-4" />
                {it.label}
              </button>
            );
          })}
        </div>
      </div>,
      document.body
    );
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={(e) => { e.stopPropagation(); setAbierto((a) => !a); }}
        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        aria-label="Acciones"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {abierto && renderFuera()}
    </>
  );
}

export function GestionUsuarios({ tipo }) {
  const labels = LABELS[tipo];
  const [usuarios, setUsuarios] = useState(MOCK_USUARIOS);
  const [cursos, setCursos] = useState([]);
  const [cargando, setCargando] = useState(CONECTADO_A_DJANGO);
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  const [curso, setCurso] = useState("");
  const [estado, setEstado] = useState(tipo === "Alumno" ? "no_baja" : "");

  const [crear, setCrear] = useState(false);
  const [editando, setEditando] = useState(null);
  const [confirmar, setConfirmar] = useState(null);
  const [cambioEstado, setCambioEstado] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [pinNuevo, setPinNuevo] = useState(null);
  const [toast, setToast] = useState(null);
  const [cerrando, setCerrando] = useState(false);

  const cargar = useCallback(() => {
    if (!CONECTADO_A_DJANGO) return;
    setCargando(true);
    const params = new URLSearchParams({ rol: tipo, pagina, busqueda, curso, estado });
    apiGet(`/api/admin/usuarios/?${params}`)
      .then((d) => {
        setUsuarios(d.usuarios || []);
        setPaginas(d.paginas || 1);
        setTotal(d.total || 0);
      })
      .catch(() => setUsuarios([]))
      .finally(() => setCargando(false));
  }, [tipo, pagina, busqueda, curso, estado]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    setPagina(1);
  }, [busqueda, curso, estado, tipo]);

  useEffect(() => {
    if (!CONECTADO_A_DJANGO) return;
    apiGet("/api/cursos/").then((d) => setCursos(d.cursos || [])).catch(() => {});
  }, []);

  const columnas = useMemo(() => {
    const cols = [
      { key: "nombre", label: "Nombre y apellido", render: (u) => (
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{u.nombre}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{u.gmail}</p>
          </div>
        ) },
      { key: "numero", label: "DNI / Legajo", render: (u) => u.numero ?? "—" },
    ];
    if (tipo === "Alumno") {
      cols.push({ key: "curso", label: "Curso", render: (u) => <Badge color="azul">{u.curso || "—"}</Badge> });
      cols.push({
        key: "notas", label: "Notas", render: (u) => (
          <div className="text-xs">
            <p className="text-slate-600 dark:text-slate-300">{u.notasTotal} total</p>
            {u.notasPendientes > 0 && <p className="text-amber-600 dark:text-amber-400">{u.notasPendientes} pend.</p>}
          </div>
        ),
      });
      cols.push({
        key: "pin", label: "PIN", render: (u) =>
          u.pin?.tiene ? (
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${u.pin.habilitado ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>
              <ShieldCheck className="h-3.5 w-3.5" />
              {u.pin.habilitado ? "Configurado" : "Deshabilitado"}
            </span>
          ) : (
            <span className="text-xs text-amber-600 dark:text-amber-400">Sin PIN</span>
          ),
      });
    } else if (tipo === "Profesor") {
      cols.push({
        key: "curso", label: "Cursos", render: (u) =>
          u.curso ? <Badge color="azul">{u.curso}</Badge> : <span className="text-xs text-slate-400">Según materias</span>,
      });
    } else {
      cols.push({
        key: "curso", label: "Curso(s)", render: (u) => (
          u.cursos?.length ? (
            <div className="flex max-w-[220px] flex-wrap gap-1">
              {u.cursos.map((c) => <Badge key={c} color="violeta">{c}</Badge>)}
            </div>
          ) : (
            <Badge color="violeta">{u.curso || "—"}</Badge>
          )
        ),
      });
    }
    cols.push({
      key: "ingreso", label: "Último ingreso", render: (u) => (
        <span className="text-xs text-slate-500 dark:text-slate-400">{formatearFecha(u.ultimoIngreso, true)}</span>
      ),
    });
    cols.push({ key: "estado", label: "Estado", render: (u) => {
      const b = badgePorEstado(u.estado);
      return <Badge color={b.color}>{b.label}</Badge>;
    } });
    cols.push({
      key: "acciones", label: "", className: "text-right", render: (u) => (
        <MenuAcciones usuario={u} tipo={tipo} onAccion={(accion, uu) => manejarAccion(accion, uu)} />
      ),
    });
    return cols;
  }, [tipo]);

  function manejarAccion(accion, u) {
    if (accion === "editar") {
      setEditando(u);
      return;
    }
    if (accion === "baja" || accion === "reactivar" || accion === "bloquear" || accion === "desbloquear") {
      setCambioEstado({ modo: accion, u });
      return;
    }
    if (accion === "historial") {
      setHistorial(u);
      return;
    }
    if (accion === "pin") {
      setConfirmar({ accion: "pin", u, generando: true });
      return;
    }
    if (accion === "pass") {
      setConfirmar({ accion: "pass", u, generando: true });
      return;
    }
  }

  const mensajesCambioEstado = {
    bloquear: (u) => `Cuenta de ${u.nombre} bloqueada. Sigue siendo alumno, pero no puede usar el sistema.`,
    baja: (u) => `${u.nombre} fue dado de baja. Su historial se conserva.`,
    desbloquear: (u) => `Cuenta de ${u.nombre} desbloqueada. Volvió a estar activa.`,
    reactivar: (u) => `${u.nombre} fue reactivado. Vuelve a ser alumno activo.`,
  };

  async function ejecutarCambioEstado(motivo) {
    if (!cambioEstado) return;
    setCerrando(true);
    const { modo, u } = cambioEstado;
    const accionBack = modo;
    try {
      await apiPost("/api/admin/usuarios/accion/", { gmail: u.gmail, accion: accionBack, motivo });
      setCambioEstado(null);
      setToast({ tipo: "ok", mensaje: mensajesCambioEstado[modo](u) });
      cargar();
    } catch (e) {
      setToast({ tipo: "error", mensaje: e.message });
      setCambioEstado(null);
    } finally {
      setCerrando(false);
    }
  }

  async function ejecutarAccion() {
    if (!confirmar) return;
    setCerrando(true);
    const { accion, u } = confirmar;
    try {
      if (accion === "pin") {
        const res = await apiPost("/api/admin/pin/accion/", { gmail: u.gmail, accion: "regenerar" });
        setPinNuevo({ gmail: u.gmail, pin: res.pin });
      } else if (accion === "pass") {
        const res = await apiPost("/api/admin/usuarios/accion/", { gmail: u.gmail, accion: "resetear_password" });
        setToast({ tipo: "ok", mensaje: `Contraseña restablecida a "1234".` });
        void res;
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

  async function guardarNuevo(form) {
    setCerrando(true);
    try {
      await apiPost("/api/admin/usuarios/crear/", { ...form, tipo });      setCrear(false);
      setToast({ tipo: "ok", mensaje: `${labels.singular[0].toUpperCase() + labels.singular.slice(1)} creado.` });
      setPagina(1);
      cargar();
    } catch (e) {
      setToast({ tipo: "error", mensaje: e.message });
    } finally {
      setCerrando(false);
    }
  }

  async function guardarEdit(form) {
    setCerrando(true);
    try {
      await apiPost("/api/admin/usuarios/editar/", {
        gmail: editando.gmail,
        apellido: form.apellido,
        nombres: form.nombres,
        numero: form.numero,
        curso: form.curso,
        turno: form.turno,
        emailTutor: form.emailTutor,
      });
      setEditando(null);
      setToast({ tipo: "ok", mensaje: "Cambios guardados." });
      cargar();
    } catch (e) {
      setToast({ tipo: "error", mensaje: e.message });
    } finally {
      setCerrando(false);
    }
  }

  const textosConfirmacion = {
    pin: `Se va a generar un PIN nuevo para ${confirmar?.u.nombre}. El anterior deja de servir.`,
    pass: `Se va a restablecer la contraseña de ${confirmar?.u.nombre} a "1234".`,
  };

  return (
    <div>
      <SectionHeading
        eyebrow={CURRENT_USER.rol}
        title={labels.titulo}
        action={
          <button
            onClick={() => setCrear(true)}
            className="flex items-center gap-2 rounded-lg bg-cyan-700 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-800"
          >
            <Plus className="h-4 w-4" />
            Nuevo {labels.singular}
          </button>
        }
      />

      <Filtros busqueda={busqueda} setBusqueda={setBusqueda} curso={curso} setCurso={setCurso} estado={estado} setEstado={setEstado} cursos={cursos} tipo={tipo} />

      <AdminTable
        columns={columnas}
        rows={usuarios}
        rowKey={(u) => u.gmail}
        loading={cargando}
        pagination={{ pagina, paginas, total, onChange: setPagina }}
        empty={{ title: `No hay ${labels.plural} que coincidan` }}
      />

      <Modal
        open={crear}
        onClose={() => !cerrando && setCrear(false)}
        title={`Nuevo ${labels.singular}`}
        subtitle="El alta queda registrada en la auditoría."
        size="lg"
      >
        <FormularioUsuario tipo={tipo} cursos={cursos} cerrando={cerrando} onGuardar={guardarNuevo} />
      </Modal>

      <Modal
        open={!!editando}
        onClose={() => !cerrando && setEditando(null)}
        title="Editar datos"
        subtitle={editando?.gmail}
        size="lg"
      >
        {editando && (
          <FormularioUsuario tipo={tipo} inicial={editando} cursos={cursos} cerrando={cerrando} onGuardar={guardarEdit} />
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmar}
        onClose={() => !cerrando && setConfirmar(null)}
        onConfirm={ejecutarAccion}
        cargando={cerrando}
        title={confirmar?.accion === "pass" ? "Restablecer contraseña" : "Generar PIN"}
        text={confirmar ? textosConfirmacion[confirmar.accion] : ""}
        confirmLabel={confirmar?.accion === "pass" ? "Restablecer" : "Generar PIN"}
      />

      <ModalEstado
        modo={cambioEstado?.modo}
        usuario={cambioEstado?.u}
        etiqueta={labels.singular}
        cerrando={cerrando}
        onCerrar={() => !cerrando && setCambioEstado(null)}
        onConfirmar={ejecutarCambioEstado}
      />

      <ModalHistorial usuario={historial} onCerrar={() => setHistorial(null)} />

      <Modal
        open={!!pinNuevo}
        onClose={() => setPinNuevo(null)}
        title="PIN del responsable"
        subtitle={`Mostralo al responsable de ${pinNuevo?.gmail || "la familia"} — se muestra una sola vez.`}
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
