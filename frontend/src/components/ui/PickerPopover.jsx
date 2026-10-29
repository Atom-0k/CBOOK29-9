import { useEffect, useState } from "react";

/**
 * Popover compartido para los selectores visuales de hora y fecha.
 * - En celular se abre como bottom sheet con fondo oscuro.
 * - En pantallas medianas+ se ancla como popover compacto debajo del campo.
 * - Se reposiciona al hacer scroll o resize mientras está abierto.
 */
export default function PickerPopover({ abierto, onCerrar, anchorRef, className = "", children }) {
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!abierto) return;
    const calcular = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({
        top: r.bottom + 6,
        left: Math.max(8, Math.min(r.left, window.innerWidth - 300)),
      });
    };
    calcular();
    window.addEventListener("resize", calcular);
    window.addEventListener("scroll", calcular, true);
    return () => {
      window.removeEventListener("resize", calcular);
      window.removeEventListener("scroll", calcular, true);
    };
  }, [abierto, anchorRef]);

  useEffect(() => {
    if (!abierto) return;
    function onKey(e) {
      if (e.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 sm:hidden"
        onClick={onCerrar}
        aria-hidden="true"
      />
      <div className="fixed inset-x-3 bottom-3 z-50 sm:hidden">
        <div className="max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-700 dark:bg-slate-800">
          {children}
        </div>
      </div>
      {pos && (
        <div style={{ top: pos.top, left: pos.left }} className="fixed z-50 hidden sm:block">
          <div
            className={`max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800 ${className}`}
          >
            {children}
          </div>
        </div>
      )}
    </>
  );
}
