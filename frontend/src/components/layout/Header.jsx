import { useState, useEffect, useRef } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import logo from "../../assets/virgen.png";
import { ThemeToggle } from "../ui/ThemeToggle";

export function Header({ user }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur transition-colors duration-200 dark:border-slate-800 dark:bg-slate-900/95 sm:px-6">
      <div className="flex items-center gap-2">
        <img src={logo} alt="ITNSI" className="h-8 w-8 rounded-lg object-contain" />
        <span className="text-sm font-bold text-slate-900 dark:text-slate-100 sm:text-base">
          ITNSI{" "}
          <span className="hidden font-medium text-slate-400 dark:text-slate-500 sm:inline">· Cuaderno Digital</span>
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <ThemeToggle />
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={open}
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors duration-200 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 dark:hover:bg-slate-800"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-100 text-xs font-semibold text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-400">
              {user.iniciales}
            </div>
            <span className="hidden text-sm font-medium text-slate-700 dark:text-slate-300 sm:inline">
              {user.nombre}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          </button>

          {open && (
            <div
              role="menu"
              className="absolute right-0 top-11 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-700 sm:hidden">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{user.nombre}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{user.rol}</p>
              </div>
              <button
                role="menuitem"
                onClick={() => {
                  window.location.href = "/logout/";
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 focus:outline-none focus-visible:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
