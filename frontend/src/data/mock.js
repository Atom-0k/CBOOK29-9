/* ============================================================================
   MOCK DATA
   En producción esto se reemplaza por fetch a la API de Django.
============================================================================ */

export const CONECTADO_A_DJANGO = typeof window !== "undefined" && !!window.__CUADERNO_USER__;

const MOCK_USER = {
  nombre: "Martina Gómez",
  rol: "Alumno",
  curso: "5° Electromecánica",
  iniciales: "MG",
};

const usuarioReal =
  typeof window !== "undefined" && window.__CUADERNO_USER__ ? window.__CUADERNO_USER__ : MOCK_USER;

function capitalizar(texto) {
  if (!texto) return texto;
  const limpio = String(texto).trim().toLowerCase();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

const rolesCrudos =
  Array.isArray(usuarioReal.roles) && usuarioReal.roles.length ? usuarioReal.roles : ["Alumno"];

export const CURRENT_USER = {
  ...usuarioReal,
  roles: rolesCrudos.map(capitalizar),
  rol: rolesCrudos.map(capitalizar).join(" / "),
};

const MOCK_NOTAS_ALUMNO = [
  {
    id: 1,
    tipo: "comunicado",
    titulo: "Suspensión de clases de taller",
    contenido: "El día jueves 17 no habrá actividades en el taller de mecanizado por mantenimiento de máquinas.",
    autor: "Secretaría",
    fecha: "2026-07-08",
    leida: false,
  },
  {
    id: 2,
    tipo: "felicitacion",
    titulo: "Reconocimiento por proyecto final",
    contenido: "Se destaca tu desempeño en la presentación del proyecto de Automatización Industrial.",
    autor: "Prof. R. Ibáñez",
    fecha: "2026-07-06",
    leida: false,
  },
  {
    id: 3,
    tipo: "citacion",
    titulo: "Citación a entrevista con Preceptoría",
    contenido: "Se solicita presencia de un adulto responsable el día 14/07 a las 10:00 hs.",
    autor: "Preceptoría 5° A",
    fecha: "2026-07-05",
    leida: true,
    requierePin: true,
  },
  {
    id: 4,
    tipo: "amonestacion",
    titulo: "Llegada tarde reiterada",
    contenido: "Tercera llegada tarde en el mes sin justificar. Se registra amonestación según reglamento.",
    autor: "Preceptoría 5° A",
    fecha: "2026-07-02",
    leida: true,
  },
];

export const CURRENT_NOTAS =
  typeof window !== "undefined" && window.__CUADERNO_NOTAS__ ? window.__CUADERNO_NOTAS__ : MOCK_NOTAS_ALUMNO;

const MOCK_HORARIO = {
  Lunes: [
    { Inicio: "07:30", Fin: "09:30", Materia: "Análisis Matemático", Profesor: "Prof. L. Duarte" },
    { Inicio: "09:50", Fin: "10:50", Materia: "Taller de Mecanizado", Profesor: "Prof. H. Salas" },
  ],
  Martes: [{ Inicio: "07:30", Fin: "09:30", Materia: "Sistemas de Control", Profesor: "Prof. R. Ibáñez" }],
  Miercoles: [],
  Jueves: [{ Inicio: "10:50", Fin: "12:50", Materia: "Taller de Mecanizado", Profesor: "Prof. H. Salas" }],
  Viernes: [],
};

export const CURRENT_HORARIO =
  typeof window !== "undefined" && window.__CUADERNO_HORARIO__ ? window.__CUADERNO_HORARIO__ : MOCK_HORARIO;

const MOCK_ASIGNACIONES = [
  { _id: "mock001", curso: "7°A", materia: "Base de Datos" },
  { _id: "mock002", curso: "6°B", materia: "Base de Datos" },
  { _id: "mock003", curso: "3A", materia: null },
];

export const CURRENT_ASIGNACIONES =
  typeof window !== "undefined" && window.__CUADERNO_ASIGNACIONES__
    ? window.__CUADERNO_ASIGNACIONES__
    : MOCK_ASIGNACIONES;

export const MATERIAS_MOCK = [
  { id: 1, nombre: "Análisis Matemático", profesor: "Prof. L. Duarte" },
  { id: 2, nombre: "Sistemas de Control", profesor: "Prof. R. Ibáñez" },
  { id: 3, nombre: "Taller de Mecanizado", profesor: "Prof. H. Salas" },
];

function filaVacia(i) {
  return {
    fila: i,
    fecha: "",
    detalle: "",
    firmaDocente: "",
    firmaPadre: "",
  };
}

function cuatrimestreVacio() {
  return {
    filas: Array.from({ length: 7 }, (_, i) => filaVacia(i + 1)),
    notaFinal: "",
  };
}

export const MOCK_CALIFICACIONES = {
  "Análisis Matemático": {
    cuatrimestres: {
      "1": {
        filas: [
          { fila: 1, fecha: "2026-04-10", detalle: "Trabajo práctico N°1 (Límites) — 8", firmaDocente: "Prof. L. Duarte", firmaPadre: "" },
          { fila: 2, fecha: "2026-04-24", detalle: "Parcial N°1 — 7", firmaDocente: "Prof. L. Duarte", firmaPadre: "" },
          { fila: 3, fecha: "2026-05-15", detalle: "Trabajo práctico N°2 (Derivadas) — 9", firmaDocente: "Prof. L. Duarte", firmaPadre: "" },
          { fila: 4, fecha: "2026-06-05", detalle: "Parcial N°2 — 6", firmaDocente: "Prof. L. Duarte", firmaPadre: "" },
          { fila: 5, fecha: "", detalle: "", firmaDocente: "", firmaPadre: "" },
          { fila: 6, fecha: "", detalle: "", firmaDocente: "", firmaPadre: "" },
          { fila: 7, fecha: "", detalle: "", firmaDocente: "", firmaPadre: "" },
        ],
        notaFinal: "7.5",
      },
      "2": cuatrimestreVacio(),
      "3": cuatrimestreVacio(),
      "4": cuatrimestreVacio(),
      "5": cuatrimestreVacio(),
    },
  },
};

export function getCalificacionesMateria(nombreMateria) {
  return (
    MOCK_CALIFICACIONES[nombreMateria] || {
      cuatrimestres: {
        "1": cuatrimestreVacio(),
        "2": cuatrimestreVacio(),
        "3": cuatrimestreVacio(),
        "4": cuatrimestreVacio(),
        "5": cuatrimestreVacio(),
      },
    }
  );
}

export const MOCK_ALUMNOS_CURSO = [
  { id: 1, nombre: "Lucas Martín Acevedo", gmail: "48379007@insi.edu.ar" },
  { id: 2, nombre: "Martina Gómez", gmail: "martina.gomez@insi.edu.ar" },
  { id: 3, nombre: "Jorge Emanuel Serrano", gmail: "jorge.serrano@insi.edu.ar" },
];

export const MOCK_NOTAS_ENVIADAS = [
  {
    id: 1,
    tipo: "comunicado",
    titulo: "Suspensión de clases de taller",
    contenido: "El jueves 17 no habrá actividades en el taller por mantenimiento de máquinas.",
    autor: "Vos",
    fecha: "2026-07-08",
    leida: true,
    destino: "Todo 7°A",
  },
  {
    id: 2,
    tipo: "citacion",
    titulo: "Citación a entrevista con Preceptoría",
    contenido: "Se solicita presencia de un adulto responsable para firmar la nota con PIN.",
    autor: "Vos",
    fecha: "2026-07-06",
    leida: true,
    destino: "Todo 7°A",
    requierePin: true,
    confirmada: false,
    todosFirmaron: false,
    cantidadAlumnos: 3,
    firmados: ["Martina Gómez"],
    sinFirmar: ["Lucas Martín Acevedo", "Jorge Emanuel Serrano"],
  },
  {
    id: 3,
    tipo: "felicitacion",
    titulo: "Reconocimiento por proyecto final",
    contenido: "Felicidades a todo el curso por el desempeño en el proyecto de Automatización Industrial.",
    autor: "Vos",
    fecha: "2026-07-02",
    leida: true,
    destino: "Todo 7°A",
    requierePin: true,
    confirmada: true,
    todosFirmaron: true,
    cantidadAlumnos: 3,
    firmados: ["Lucas Martín Acevedo", "Martina Gómez", "Jorge Emanuel Serrano"],
    sinFirmar: [],
  },
];
