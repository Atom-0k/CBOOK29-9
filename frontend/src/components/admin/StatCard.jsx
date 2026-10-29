import { Skeleton } from "../ui/Skeleton";

const ACENTOS = {
  cyan: {
    card: "rounded-xl bg-gradient-to-br from-cyan-800 to-cyan-900 p-5 text-white shadow-sm dark:from-cyan-700 dark:to-cyan-900",
    label: "text-cyan-100",
    icon: "text-cyan-200",
    valor: "",
  },
  blue: {
    card: "rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900",
    label: "text-slate-500 dark:text-slate-400",
    icon: "text-blue-600 dark:text-blue-400",
    valor: "text-slate-900 dark:text-slate-100",
  },
  emerald: {
    card: "rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900",
    label: "text-slate-500 dark:text-slate-400",
    icon: "text-emerald-600 dark:text-emerald-400",
    valor: "text-slate-900 dark:text-slate-100",
  },
  amber: {
    card: "rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900",
    label: "text-slate-500 dark:text-slate-400",
    icon: "text-amber-600 dark:text-amber-400",
    valor: "text-amber-600 dark:text-amber-400",
  },
  rose: {
    card: "rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900",
    label: "text-slate-500 dark:text-slate-400",
    icon: "text-rose-600 dark:text-rose-400",
    valor: "text-rose-600 dark:text-rose-400",
  },
  violet: {
    card: "rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900",
    label: "text-slate-500 dark:text-slate-400",
    icon: "text-violet-600 dark:text-violet-400",
    valor: "text-slate-900 dark:text-slate-100",
  },
};

export function StatCard({ label, value, icon: Icon, accent = "blue", loading = false, sub, compact = false, centrarValor = false }) {
  const a = ACENTOS[accent] || ACENTOS.blue;
  return (
    <div className={a.card}>
      <div className="flex items-center justify-between">
        <p className={`text-sm font-medium ${a.label}`}>{label}</p>
        {Icon && <Icon className={`h-4 w-4 ${a.icon}`} aria-hidden="true" />}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-16" />
      ) : (
        <p className={`mt-2 font-bold ${compact ? "text-2xl" : "text-3xl"} ${a.valor} ${centrarValor ? "text-center" : ""}`}>{value ?? "—"}</p>
      )}
      {sub && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  );
}
