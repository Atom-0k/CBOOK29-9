export function BottomNav({ secciones, activa, onNavigate, badges }) {
  const etiquetasCortas = {
    "Mis Calificaciones": "Boletín",
    "Historial de Notas": "Historial",
    "Editar Horarios": "Horarios",
    Dashboard: "Panel",
    Alumnos: "Alumnos",
    Profesores: "Profs.",
    Preceptores: "Prec.",
    Cursos: "Cursos",
    Materias: "Mat.",
    Comunicados: "Notas",
    Confirmaciones: "Conf.",
    "Gestión de PIN": "PIN",
    Auditoría: "Auditoría",
    Backups: "Backups",
    Configuración: "Config.",
  };

  const muchos = secciones.length > 6;

  return (
    <nav
      aria-label="Navegación principal"
      className={`fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 backdrop-blur transition-colors duration-200 dark:border-slate-800 dark:bg-slate-900/95 md:hidden ${
        muchos ? "overflow-x-auto" : ""
      }`}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {secciones.map((s) => {
        const Icon = s.icon;
        const isActive = activa === s.id;
        const badge = badges?.[s.id];
        return (
          <button
            key={s.id}
            onClick={() => onNavigate(s.id)}
            aria-current={isActive ? "page" : undefined}
            className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 focus-visible:ring-inset ${
              muchos ? "min-w-[64px] shrink-0" : "flex-1"
            }`}
          >
            <span className="relative">
              <Icon
                className={`h-5 w-5 ${isActive ? "text-cyan-800 dark:text-cyan-400" : "text-slate-400 dark:text-slate-500"}`}
                aria-hidden="true"
              />
              {!!badge && (
                <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-cyan-800 text-[9px] font-bold text-white dark:bg-cyan-600">
                  {badge}
                </span>
              )}
            </span>
            <span className={isActive ? "text-cyan-800 dark:text-cyan-400" : "text-slate-400 dark:text-slate-500"}>
              {etiquetasCortas[s.label] || s.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
