import { LogOut } from "lucide-react";
import logo from "../../assets/virgen.png";

export function Sidebar({ secciones, activa, onNavigate, badges, rol = "Alumno" }) {
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-slate-200 bg-white transition-colors duration-200 dark:border-slate-800 dark:bg-slate-900 md:flex"
    >
      <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-5 dark:border-slate-800">
        <img src={logo} alt="ITNSI" className="h-8 w-8 rounded-lg object-contain" />
        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">ITNSI</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {rol}
        </p>
        <ul className="space-y-0.5">
          {secciones.map((s) => {
            const Icon = s.icon;
            const isActive = activa === s.id;
            const badge = badges?.[s.id];
            return (
              <li key={s.id}>
                <button
                  onClick={() => onNavigate(s.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${
                    isActive
                      ? "bg-cyan-50 text-cyan-800 dark:bg-cyan-500/10 dark:text-cyan-400"
                      : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
                  }`}
                >
                  <Icon
                    className={`h-4.5 w-4.5 shrink-0 ${
                      isActive
                        ? "text-cyan-700 dark:text-cyan-400"
                        : "text-slate-400 group-hover:text-slate-500 dark:text-slate-500 dark:group-hover:text-slate-400"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="truncate">{s.label}</span>
                  {!!badge && (
                    <span className="ml-auto rounded-full bg-cyan-800 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-cyan-600">
                      {badge}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        <button
          onClick={() => {
            window.location.href = "/logout/";
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-colors duration-200 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 dark:text-slate-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
        >
          <LogOut className="h-4.5 w-4.5" aria-hidden="true" />
          Cerrar sesión
        </button>
      </div>
    </nav>
  );
}
