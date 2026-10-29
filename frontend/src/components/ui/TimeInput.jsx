import { useCallback, useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import SegmentInput from "./SegmentInput";
import PickerPopover from "./PickerPopover";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function parseValor(valor) {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec((valor || "").trim());
  if (!m) return { hh: "", mm: "" };
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (h > 23 || mm > 59) return { hh: "", mm: "" };
  return { hh: pad2(h), mm: pad2(mm) };
}

/**
 * Input de hora segmentado y editable por teclado.
 * Formato de 24 hs: [ HH ] : [ MM ] 🕐
 * El usuario puede escribir directo (3:25, 03:25, 15:25) o usar el
 * selector visual opcional (popover en PC, bottom sheet en celular).
 */
export function TimeInput({ value = "", onChange, disabled = false, className = "" }) {
  const [seg, setSeg] = useState(() => parseValor(value));
  const [activo, setActivo] = useState(0);
  const [picker, setPicker] = useState(false);
  const wrapRef = useRef(null);
  const refs = { hh: useRef(null), mm: useRef(null) };
  const segRef = useRef(seg);
  const orden = ["hh", "mm"];

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
    const { hh, mm } = segRef.current;
    const vacio = hh === "" && mm === "";
    const h = /^\d{1,2}$/.test(hh) ? parseInt(hh, 10) : null;
    const m = /^\d{1,2}$/.test(mm) ? parseInt(mm, 10) : null;
    const hOk = h != null && h >= 0 && h <= 23;
    const mOk = m != null && m >= 0 && m <= 59;
    const completo = hOk && mOk;

    if (vacio || completo) {
      const next = {
        hh: hOk ? pad2(h) : hh,
        mm: mOk ? pad2(m) : mm,
      };
      segRef.current = next;
      setSeg(next);
      onChange(completo ? `${next.hh}:${next.mm}` : "");
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

  function elegir(hh, mm) {
    const next = { hh: pad2(hh), mm: pad2(mm) };
    segRef.current = next;
    setSeg(next);
    onChange(`${next.hh}:${next.mm}`);
    setPicker(false);
  }

  const horas = Array.from({ length: 24 }, (_, i) => pad2(i));
  const minutos = Array.from({ length: 12 }, (_, i) => pad2(i * 5));
  const segClase =
    "h-8 w-9 bg-transparent text-center text-sm font-semibold text-slate-900 outline-none selection:bg-cyan-500/30 focus:rounded-md focus:bg-slate-100 disabled:opacity-50 dark:text-slate-100 dark:focus:bg-slate-700";

  return (
    <div
      ref={wrapRef}
      className={`relative inline-flex items-center rounded-lg border border-slate-300 bg-white px-1 py-0.5 transition-colors focus-within:border-cyan-600 dark:border-slate-600 dark:bg-slate-800 ${className}`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) commit();
      }}
    >
      <SegmentInput
        ref={refs.hh}
        value={seg.hh}
        maxLength={2}
        min={0}
        max={23}
        disabled={disabled}
        ariaLabel="Horas"
        placeholder="00"
        onValueChange={(v) => setCampo("hh", v)}
        onFocus={() => setActivo(0)}
        onMove={mover}
        onAdvance={avanzar}
        onEnter={avanzar}
        className={segClase}
      />
      <span className="select-none px-0.5 text-sm font-medium text-slate-400 dark:text-slate-500">:</span>
      <SegmentInput
        ref={refs.mm}
        value={seg.mm}
        maxLength={2}
        min={0}
        max={59}
        disabled={disabled}
        ariaLabel="Minutos"
        placeholder="00"
        onValueChange={(v) => setCampo("mm", v)}
        onFocus={() => setActivo(1)}
        onMove={mover}
        onAdvance={() => {
          refs.hh.current?.focus();
          setActivo(0);
        }}
        onEnter={commit}
        className={segClase}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => setPicker((p) => !p)}
        aria-label="Abrir selector de hora"
        title="Elegir hora"
        className="ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-cyan-700 disabled:opacity-50 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-cyan-300"
      >
        <Clock className="h-4 w-4" aria-hidden="true" />
      </button>

      <PickerPopover abierto={picker} onCerrar={() => setPicker(false)} anchorRef={wrapRef} className="w-44">
        <div className="flex gap-2 p-1">
          <ListaNumeros label="Hora" opciones={horas} seleccionado={seg.hh} onElegir={(h) => elegir(parseInt(h, 10), parseInt(seg.mm || "0", 10))} />
          <ListaNumeros label="Min" opciones={minutos} seleccionado={seg.mm} onElegir={(m) => elegir(parseInt(seg.hh || "0", 10), parseInt(m, 10))} />
        </div>
      </PickerPopover>
    </div>
  );
}

function ListaNumeros({ label, opciones, seleccionado, onElegir }) {
  const ref = useRef(null);

  useEffect(() => {
    const cont = ref.current;
    if (!cont) return;
    const el = cont.querySelector('[data-activo="true"]');
    if (el) cont.scrollTop = Math.max(0, el.offsetTop - cont.clientHeight / 2 + el.clientHeight / 2);
  }, []);

  return (
    <div className="flex-1">
      <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <div ref={ref} className="h-40 overflow-y-auto rounded-lg border border-slate-200 py-0.5 dark:border-slate-700">
        {opciones.map((op) => (
          <button
            key={op}
            type="button"
            data-activo={op === seleccionado}
            onClick={() => onElegir(op)}
            className={`block w-full px-2 py-1 text-center text-xs font-medium transition-colors ${
              op === seleccionado
                ? "bg-cyan-700 text-white"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {op}
          </button>
        ))}
      </div>
    </div>
  );
}
