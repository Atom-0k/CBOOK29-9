import { useState } from "react";
import { Lock } from "lucide-react";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { CURRENT_USER } from "../../data/mock";

export function PerfilView() {
  const [pass, setPass] = useState({ actual: "", nueva: "", repetir: "" });

  return (
    <div>
      <SectionHeading eyebrow={CURRENT_USER.rol} title="Mi Perfil" />
      <div className="mx-auto max-w-md">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-800 text-sm font-semibold text-white dark:bg-cyan-600">{CURRENT_USER.iniciales}</div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{CURRENT_USER.nombre}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{CURRENT_USER.curso}</p>
            </div>
          </div>
          <div className="mb-4 mt-2 flex items-center gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <Lock className="h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Cambiar contraseña</p>
          </div>
          {["actual", "nueva", "repetir"].map((k) => (
            <div key={k} className="mb-3">
              <label className="mb-1 block text-xs font-medium capitalize text-slate-600 dark:text-slate-400">Contraseña {k === "actual" ? "actual" : k}</label>
              <input
                type="password"
                value={pass[k]}
                onChange={(e) => setPass({ ...pass, [k]: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-cyan-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          ))}
          <button className="mt-1 w-full rounded-lg bg-cyan-800 px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-cyan-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600/40 dark:bg-cyan-600 dark:hover:bg-cyan-500">
            Actualizar contraseña
          </button>
        </div>
      </div>
    </div>
  );
}
