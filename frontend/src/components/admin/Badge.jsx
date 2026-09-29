const COLORES = {
  verde: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  azul: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  ambar: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  rojo: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400",
  gris: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  violeta: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400",
  cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400",
};

export function Badge({ color = "gris", children }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${COLORES[color] || COLORES.gris}`}
    >
      {children}
    </span>
  );
}

export function badgePorEstado(estado) {
  switch (estado) {
    case "Activo":
    case "activo":
      return { color: "verde", label: "Activo" };
    case "Baja":
    case "baja":
      return { color: "gris", label: "Dado de baja" };
    case "Bloqueado":
    case "bloqueado":
      return { color: "rojo", label: "Bloqueado" };
    case "Suspendido":
      return { color: "ambar", label: "Suspendido" };
    case "sin_pin":
      return { color: "ambar", label: "Sin PIN" };
    case "inactivo":
      return { color: "gris", label: "PIN deshabilitado" };
    case "confirmada":
      return { color: "verde", label: "Confirmada" };
    case "pendiente":
      return { color: "ambar", label: "Pendiente" };
    case "archivada":
      return { color: "violeta", label: "Archivada" };
    case "papelera":
      return { color: "gris", label: "Papelera" };
    case "sin_pin_confirmacion":
      return { color: "azul", label: "Sin PIN requerido" };
    default:
      return { color: "gris", label: estado };
  }
}

export function badgePorTipoNota(tipo) {
  switch (tipo) {
    case "comunicado":
      return { color: "azul", label: "Comunicado" };
    case "citacion":
      return { color: "violeta", label: "Citación" };
    case "amonestacion":
      return { color: "rojo", label: "Amonestación" };
    case "felicitacion":
      return { color: "verde", label: "Felicitación" };
    case "nota":
      return { color: "cyan", label: "Nota" };
    default:
      return { color: "gris", label: tipo };
  }
}
