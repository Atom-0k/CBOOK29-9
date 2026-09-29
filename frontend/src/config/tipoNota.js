import { MessageSquare, AlertTriangle, ClipboardList, Award } from "lucide-react";

export const TIPO_NOTA = {
  comunicado: {
    label: "Comunicado",
    icon: MessageSquare,
    text: "text-sky-700 dark:text-sky-400",
    bg: "bg-sky-50 dark:bg-sky-500/10",
    border: "border-sky-500 dark:border-sky-500/70",
  },
  amonestacion: {
    label: "Amonestación",
    icon: AlertTriangle,
    text: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-500/10",
    border: "border-rose-500 dark:border-rose-500/70",
  },
  citacion: {
    label: "Citación",
    icon: ClipboardList,
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-500/10",
    border: "border-amber-500 dark:border-amber-500/70",
  },
  felicitacion: {
    label: "Felicitación",
    icon: Award,
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
    border: "border-emerald-500 dark:border-emerald-500/70",
  },
};
