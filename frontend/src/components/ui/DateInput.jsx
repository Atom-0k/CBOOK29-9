import { useCallback, useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import SegmentInput from "./SegmentInput";
import PickerPopover from "./PickerPopover";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function diasEnMes(y, m0) {
  return new Date(y, m0 + 1, 0).getDate();
}

function parseValor(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((valor || "").trim());
  if (!m) return { mm: "", dd: "", yyyy: "" };
  const y = parseInt(m[1], 10);
  const mes = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (mes < 1 || mes > 12 || d < 1 || d > diasEnMes(y, mes - 1)) return { mm: "", dd: "", yyyy: "" };
  return { mm: pad2(mes), dd: pad2(d), yyyy: String(y) };
}

/**
 * Input de fecha segmentado y editable por teclado.
 * Formato: [ DD ] / [ MM ] / [ AAAA ] 📅
 * Cada segmento recibe focus y se escribe directo; el calendario
 * visual es una alternativa opcional (popover en PC, bottom sheet en celular).
 */
export function DateInput({ value = "", onChange, disabled = false, className = "" }) {
  const [seg, setSeg] = useState(() => parseValor(value));
  const [activo, setActivo] = useState(0);
  const [picker, setPicker] = useState(false);
  const wrapRef = useRef(null);
  const refs = { mm: useRef(null), dd: useRef(null), yyyy: useRef(null) };
  const segRef = useRef(seg);
  const orden = ["dd", "mm", "yyyy"];

  function setCampo(campo, val) {
    const next = { ...segRef.current, [campo]: val };
    segRef.current = next;
    setSeg(next);
  }

  useEffect(() => {
    const next = parseValor(value);
    segRef.current = next;
    setSeg(next);
  }, [value]);

  const commit = useCallback(() => {
    const { mm, dd, yyyy } = segRef.current;
    const vacio = mm === "" && dd === "" && yyyy === "";

    const yNum = /^\d{4}$/.test(yyyy) ? parseInt(yyyy, 10) : null;
    const mNum = /^\d{1,2}$/.test(mm) ? parseInt(mm, 10) : null;
    const dNum = /^\d{1,2}$/.test(dd) ? parseInt(dd, 10) : null;

    const yOk = yNum != null && yNum >= 1900 && yNum <= 2100;
    const mOk = mNum != null && mNum >= 1 && mNum <= 12;
    const dOk =
      dNum != null &&
      dNum >= 1 &&
      dNum <= diasEnMes(yOk ? yNum : new Date().getFullYear(), mOk ? mNum - 1 : 0);

    const completo = yOk && mOk && dOk;

    if (vacio || completo) {
      const next = {
        mm: mOk ? pad2(mNum) : mm,
        dd: dOk ? pad2(dNum) : dd,
        yyyy: yOk ? String(yNum) : yyyy,
      };
      segRef.current = next;
      setSeg(next);
      onChange(completo ? `${next.yyyy}-${next.mm}-${next.dd}` : "");
    }
  }, [onChange]);

  function mover(dir) {
    const idx = Math.min(orden.length - 1, Math.max(0, activo + dir));
    refs[orden[idx]].current?.focus();
    setActivo(idx);
  }

  function avanzar() {
    const idx = Math.min(orden.length - 1, activo + 1);
    refs[orden[idx]].current?.focus();
    setActivo(idx);
  }

  function elegir({ y, m, d }) {
    const next = { mm: pad2(m + 1), dd: pad2(d), yyyy: String(y) };
    segRef.current = next;
    setSeg(next);
    onChange(`${next.yyyy}-${next.mm}-${next.dd}`);
    setPicker(false);
  }

  const segClase =
    "h-8 bg-transparent text-center text-sm font-semibold text-slate-900 outline-none selection:bg-cyan-500/30 focus:rounded-md focus:bg-slate-100 disabled:opacity-50 dark:text-slate-100 dark:focus:bg-slate-700";

  return (
    <div
      ref={wrapRef}
      className={`relative inline-flex items-center rounded-lg border border-slate-300 bg-white px-1 py-0.5 transition-colors focus-within:border-cyan-600 dark:border-slate-600 dark:bg-slate-800 ${className}`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) commit();
      }}
    >
      <SegmentInput
        ref={refs.dd}
        value={seg.dd}
        maxLength={2}
        min={1}
        max={31}
        disabled={disabled}
        ariaLabel="Día"
        placeholder="DD"
        onValueChange={(v) => setCampo("dd", v)}
        onFocus={() => setActivo(0)}
        onMove={mover}
        onAdvance={avanzar}
        onEnter={avanzar}
        className={`${segClase} w-8`}
      />
      <span className="select-none px-0.5 text-sm font-medium text-slate-400 dark:text-slate-500">/</span>
      <SegmentInput
        ref={refs.mm}
        value={seg.mm}
        maxLength={2}
        min={1}
        max={12}
        disabled={disabled}
        ariaLabel="Mes"
        placeholder="MM"
        onValueChange={(v) => setCampo("mm", v)}
        onFocus={() => setActivo(1)}
        onMove={mover}
        onAdvance={avanzar}
        onEnter={avanzar}
        className={`${segClase} w-8`}
      />
      <span className="select-none px-0.5 text-sm font-medium text-slate-400 dark:text-slate-500">/</span>
      <SegmentInput
        ref={refs.yyyy}
        value={seg.yyyy}
        maxLength={4}
        min={1900}
        max={2100}
        disabled={disabled}
        ariaLabel="Año"
        placeholder="AAAA"
        onValueChange={(v) => setCampo("yyyy", v)}
        onFocus={() => setActivo(2)}
        onMove={mover}
        onAdvance={() => {
          refs.dd.current?.focus();
          setActivo(0);
        }}
        onEnter={commit}
        className={`${segClase} w-11`}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => setPicker((p) => !p)}
        aria-label="Abrir calendario"
        title="Elegir fecha"
        className="ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-cyan-700 disabled:opacity-50 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-cyan-300"
      >
        <Calendar className="h-4 w-4" aria-hidden="true" />
      </button>

      <PickerPopover abierto={picker} onCerrar={() => setPicker(false)} anchorRef={wrapRef} className="w-64">
        <Calendario valor={value} onElegir={elegir} />
      </PickerPopover>
    </div>
  );
}

const DIAS_SEMANA = ["L", "M", "X", "J", "V", "S", "D"];
const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function Calendario({ valor, onElegir }) {
  const hoy = new Date();
  const sel = (() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor || "");
    return m ? { y: parseInt(m[1], 10), m: parseInt(m[2], 10) - 1, d: parseInt(m[3], 10) } : null;
  })();
  const inicial = sel ? { y: sel.y, m: sel.m } : { y: hoy.getFullYear(), m: hoy.getMonth() };
  const [vista, setVista] = useState(inicial);

  function navegar(delta) {
    setVista((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  const dias = diasEnMes(vista.y, vista.m);
  const offset = (new Date(vista.y, vista.m, 1).getDay() + 6) % 7;
  const celdas = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: dias }, (_, i) => i + 1),
  ];

  return (
    <div className="p-2">
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navegar(-1)}
          aria-label="Mes anterior"
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-cyan-700 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-cyan-300"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          {NOMBRES_MES[vista.m]} {vista.y}
        </span>
        <button
          type="button"
          onClick={() => navegar(1)}
          aria-label="Mes siguiente"
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-cyan-700 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-cyan-300"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {DIAS_SEMANA.map((d) => (
          <span key={d} className="py-0.5 text-[10px] font-semibold uppercase text-slate-400 dark:text-slate-500">
            {d}
          </span>
        ))}
        {celdas.map((d, i) =>
          d === null ? (
            <span key={`v${i}`} />
          ) : (
            <button
              key={`d${d}`}
              type="button"
              onClick={() => onElegir({ y: vista.y, m: vista.m, d })}
              className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium transition-colors ${
                sel && sel.y === vista.y && sel.m === vista.m && sel.d === d
                  ? "bg-cyan-700 text-white"
                  : hoy.getFullYear() === vista.y && hoy.getMonth() === vista.m && hoy.getDate() === d
                    ? "text-cyan-700 ring-1 ring-cyan-600 dark:text-cyan-300"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {d}
            </button>
          )
        )}
      </div>
    </div>
  );
}
