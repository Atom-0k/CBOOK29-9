import { useEffect, useState } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { BottomNav } from "./components/layout/BottomNav";
import { Header } from "./components/layout/Header";

import { InicioView as AlumnoInicio } from "./features/alumno/InicioView";
import { NotasView as AlumnoNotas } from "./features/alumno/NotasView";
import { HorariosView as AlumnoHorarios } from "./features/alumno/HorariosView";
import { CalificacionesView as AlumnoCalificaciones } from "./features/alumno/CalificacionesView";
import { AsistenciaView as AlumnoAsistencia } from "./features/alumno/AsistenciaView";
import { PerfilView } from "./features/alumno/PerfilView";

import { InicioView as StaffInicio } from "./features/staff/InicioView";
import { EnviarNotaView } from "./features/staff/EnviarNotaView";
import { HistorialNotasView } from "./features/staff/HistorialNotasView";
import { CalificacionesView as ProfesorCalificaciones } from "./features/profesor/CalificacionesView";
import { AsistenciaView as ProfesorAsistencia } from "./features/profesor/AsistenciaView";
import { EditarHorariosView } from "./features/preceptor/EditarHorariosView";
import { AsistenciaView as PreceptorAsistencia } from "./features/preceptor/AsistenciaView";

import { DashboardView as AdminDashboard } from "./features/admin/DashboardView";
import { AlumnosView } from "./features/admin/AlumnosView";
import { ProfesoresView } from "./features/admin/ProfesoresView";
import { PreceptoresView } from "./features/admin/PreceptoresView";
import { CursosView } from "./features/admin/CursosView";
import { MateriasView } from "./features/admin/MateriasView";
import { ComunicadosView } from "./features/admin/ComunicadosView";
import { ConfirmacionesView } from "./features/admin/ConfirmacionesView";
import { PinView } from "./features/admin/PinView";
import { AuditoriaView } from "./features/admin/AuditoriaView";
import { BackupsView } from "./features/admin/BackupsView";
import { ConfiguracionView } from "./features/admin/ConfiguracionView";

import { SECCIONES_ALUMNO, SECCIONES_ADMIN, getSeccionesPersonal } from "./config/secciones";
import { CURRENT_USER, CURRENT_NOTAS, CONECTADO_A_DJANGO } from "./data/mock";
import { getCsrfToken } from "./utils/csrf";

export default function App() {
  const roles = CURRENT_USER.roles?.length ? CURRENT_USER.roles : ["Alumno"];
  const esAdmin = roles.includes("Admin");
  const esAlumno = !esAdmin && roles.length === 1 && roles[0] === "Alumno";

  const secciones = esAdmin ? SECCIONES_ADMIN : esAlumno ? SECCIONES_ALUMNO : getSeccionesPersonal(roles);

  const [activa, setActiva] = useState(secciones[0]?.id || "inicio");
  const [notas, setNotas] = useState(CURRENT_NOTAS);
  // Preselección opcional al navegar desde una tarjeta de curso del inicio
  // (p. ej. abrir Asistencia ya en el curso que se tocó).
  const [preset, setPreset] = useState(null);
  // Mensajes sin responder sobre las notas que envió este docente. Es el aviso
  // en la app: el correo es un refuerzo, no la única vía.
  const [mensajesPendientes, setMensajesPendientes] = useState(0);

  const esStaff = !esAlumno && !esAdmin;

  useEffect(() => {
    if (!CONECTADO_A_DJANGO || !esStaff) return;
    let vivo = true;
    fetch("/api/notas/mensajes/?abiertos=1", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { pendientes: 0 }))
      .then((d) => {
        if (vivo) setMensajesPendientes(d.pendientes || 0);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [esStaff, activa]);

  function irA(id, opciones) {
    setPreset(opciones || null);
    setActiva(id);
  }

  const badges = esAlumno
    ? { notas: notas.filter((n) => !n.leida).length || undefined }
    : esStaff
      ? { historial: mensajesPendientes || undefined }
      : {};

  async function confirmarNota(notaId, pin) {
    if (!CONECTADO_A_DJANGO) {
      setNotas((prev) =>
        prev.map((n) =>
          String(n.id) === String(notaId)
            ? { ...n, requierePin: n.requierePin !== undefined ? n.requierePin : true, confirmada: true }
            : n
        )
      );
      return;
    }
    const resp = await fetch("/api/notas/confirmar/", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
      body: JSON.stringify({ notaId, pin }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data.error || "No se pudo confirmar la nota.");
    setNotas((prev) => prev.map((n) => (String(n.id) === String(notaId) ? { ...n, confirmada: true } : n)));
  }

  function renderVistaAdmin() {
    switch (activa) {
      case "dashboard":
        return <AdminDashboard />;
      case "alumnos":
        return <AlumnosView />;
      case "profesores":
        return <ProfesoresView />;
      case "preceptores":
        return <PreceptoresView />;
      case "cursos":
        return <CursosView />;
      case "materias":
        return <MateriasView />;
      case "comunicados":
        return <ComunicadosView />;
      case "confirmaciones":
        return <ConfirmacionesView />;
      case "pin":
        return <PinView />;
      case "auditoria":
        return <AuditoriaView />;
      case "backups":
        return <BackupsView />;
      case "config":
        return <ConfiguracionView />;
      default:
        return null;
    }
  }

  function renderVistaAlumno() {
    switch (activa) {
      case "inicio":
        return <AlumnoInicio notas={notas} onConfirmar={confirmarNota} onIrANotas={() => setActiva("notas")} />;
      case "notas":
        return <AlumnoNotas notas={notas} onConfirmar={confirmarNota} />;
      case "horarios":
        return <AlumnoHorarios />;
      case "calificaciones":
        return <AlumnoCalificaciones />;
      case "asistencia":
        return <AlumnoAsistencia />;
      case "perfil":
        return <PerfilView />;
      default:
        return null;
    }
  }

  function renderVistaPersonal() {
    switch (activa) {
      case "inicio":
        return <StaffInicio onIrA={irA} />;
      case "calificaciones_prof":
        return <ProfesorCalificaciones />;
      case "enviar":
        return <EnviarNotaView />;
      case "historial":
        return <HistorialNotasView />;
      case "asistencia":
        return roles.includes("Preceptor") ? (
          <PreceptorAsistencia preset={preset} />
        ) : (
          <ProfesorAsistencia preset={preset} />
        );
      case "editar_horarios":
        return <EditarHorariosView />;
      default:
        return null;
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar
        secciones={secciones}
        activa={activa}
        onNavigate={setActiva}
        badges={badges}
        rol={CURRENT_USER.rol}
      />

      <div className="flex min-h-screen flex-col md:pl-60">
        <Header user={CURRENT_USER} />
        <main className="flex-1 px-4 pb-20 pt-5 sm:px-6 md:pb-6">
          <div className="mx-auto w-full max-w-4xl">
            {esAdmin ? renderVistaAdmin() : esAlumno ? renderVistaAlumno() : renderVistaPersonal()}
          </div>
        </main>
      </div>

      <BottomNav secciones={secciones} activa={activa} onNavigate={setActiva} badges={badges} />
    </div>
  );
}