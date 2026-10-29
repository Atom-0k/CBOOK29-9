import {
  Home,
  FileText,
  CalendarDays,
  ClipboardCheck,
  User,
  Send,
  History,
  PencilLine,
  LayoutDashboard,
  GraduationCap,
  Users,
  UserCog,
  BookOpen,
  Layers,
  ShieldCheck,
  KeyRound,
  ScrollText,
  DatabaseBackup,
  Settings,
  CalendarCheck2,
} from "lucide-react";

export const SECCIONES_ALUMNO = [
  { id: "inicio", label: "Inicio", icon: Home },
  { id: "notas", label: "Mis Notas", icon: FileText },
  { id: "horarios", label: "Horarios", icon: CalendarDays },
  { id: "calificaciones", label: "Mis Calificaciones", icon: ClipboardCheck },
  { id: "asistencia", label: "Mi Asistencia", icon: CalendarCheck2 },
  { id: "perfil", label: "Perfil", icon: User },
];

/* Menú completo del Admin: gestión de usuarios, cursos, materias,
   comunicaciones, confirmaciones, PIN, auditoría, backups y configuración. */
export const SECCIONES_ADMIN = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "alumnos", label: "Alumnos", icon: GraduationCap },
  { id: "profesores", label: "Profesores", icon: Users },
  { id: "preceptores", label: "Preceptores", icon: UserCog },
  { id: "cursos", label: "Cursos", icon: BookOpen },
  { id: "materias", label: "Materias", icon: Layers },
  { id: "comunicados", label: "Comunicados", icon: FileText },
  { id: "confirmaciones", label: "Confirmaciones", icon: ShieldCheck },
  { id: "pin", label: "Gestión de PIN", icon: KeyRound },
  { id: "auditoria", label: "Auditoría", icon: ScrollText },
  { id: "backups", label: "Backups", icon: DatabaseBackup },
  { id: "config", label: "Configuración", icon: Settings },
];

/* Secciones "atómicas" del personal (Profesor / Preceptor). Se combinan
   según los roles de la persona en getSeccionesPersonal(roles) de abajo,
   sin duplicar Inicio/Enviar Nota/Historial si tiene los dos roles. */
const SEC_INICIO = { id: "inicio", label: "Inicio", icon: Home };
const SEC_CALIFICACIONES_PROF = { id: "calificaciones_prof", label: "Calificaciones", icon: ClipboardCheck };
const SEC_ENVIAR = { id: "enviar", label: "Enviar Nota", icon: Send };
const SEC_HISTORIAL = { id: "historial", label: "Historial de Notas", icon: History };
const SEC_EDITAR_HORARIOS = { id: "editar_horarios", label: "Editar Horarios", icon: PencilLine };
const SEC_ASISTENCIA = { id: "asistencia", label: "Asistencia", icon: CalendarCheck2 };

/**
 * Arma el menú del personal (no-Alumno) según los roles que tenga la
 * persona. Si tiene los dos (Profesor y Preceptor), junta todo en un
 * solo menú sin repetir Inicio/Enviar Nota/Historial.
 */
export function getSeccionesPersonal(roles = []) {
  const esProfesor = roles.includes("Profesor");
  const esPreceptor = roles.includes("Preceptor");

  const secciones = [SEC_INICIO];
  if (esProfesor) secciones.push(SEC_CALIFICACIONES_PROF);
  secciones.push(SEC_ENVIAR, SEC_HISTORIAL);
  if (esProfesor || esPreceptor) secciones.push(SEC_ASISTENCIA);
  if (esPreceptor) secciones.push(SEC_EDITAR_HORARIOS);
  return secciones;
}