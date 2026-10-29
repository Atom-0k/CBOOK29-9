import { CheckCircle2, XCircle } from "lucide-react";

export function Toast({ mensaje, tipo = "ok", onClose }) {
  if (!mensaje) return null;
  return (
    <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 md:bottom-6">
      <div
        className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${
          tipo === "error"
            ? "border-rose-200 bg-white text-rose-700 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-400"
            : "border-cyan-200 bg-white text-cyan-800 dark:border-cyan-800 dark:bg-slate-900 dark:text-cyan-300"
        }`}
      >
        {tipo === "error" ? (
          <XCircle className="h-4 w-4 shrink-0" />
        ) : (
          <CheckCircle2 className="h-4 w-4 shrink-0" />
        )}
        <span>{mensaje}</span>
        <button onClick={onClose} className="ml-2 text-current opacity-60 hover:opacity-100" aria-label="Cerrar">
          ✕
        </button>
      </div>
    </div>
  );
}
