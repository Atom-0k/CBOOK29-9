import { forwardRef, useImperativeHandle, useRef } from "react";

/**
 * Segmento numérico editable por teclado (hora, minuto, mes, día, año...).
 * - Escribir dígitos reemplaza el segmento y avanza solo al completarlo.
 * - Flechas izq/der para moverse entre segmentos, arriba/abajo para subir/bajar.
 * - Backspace borra el último dígito y retrocede si está vacío.
 * - Enter dispara onEnter (avanzar o confirmar el campo completo).
 * - El cursor se posiciona y selecciona el contenido al recibir focus.
 */
const SegmentInput = forwardRef(function SegmentInput(
  {
    value,
    maxLength,
    min,
    max,
    onValueChange,
    onAdvance,
    onMove,
    onEnter,
    disabled = false,
    inputMode = "numeric",
    ariaLabel,
    placeholder = "",
    className = "",
  },
  ref
) {
  const inputRef = useRef(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
    el: () => inputRef.current,
  }));

  function subirBajar(dir) {
    const n = parseInt(value || "0", 10);
    const actual = Number.isNaN(n) ? min : Math.min(max, Math.max(min, n));
    const siguiente = Math.min(max, Math.max(min, actual + dir));
    onValueChange(String(siguiente).padStart(value.length >= maxLength ? maxLength : 1, "0"));
  }

  function manejarTecla(e) {
    if (e.key === "ArrowLeft") { e.preventDefault(); onMove?.(-1); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); onMove?.(1); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); subirBajar(1); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); subirBajar(-1); return; }
    if (e.key === "Enter") { e.preventDefault(); onEnter?.(); return; }
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value.length > 0) onValueChange(value.slice(0, -1));
      else onMove?.(-1);
      return;
    }
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      const s = e.target.selectionStart ?? value.length;
      const en = e.target.selectionEnd ?? value.length;
      const reemplaza = s === 0 && en === value.length;
      const siguiente = reemplaza ? e.key : (value + e.key).slice(0, maxLength);
      onValueChange(siguiente);
      if (siguiente.length >= maxLength) setTimeout(() => onAdvance?.(), 0);
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
    }
  }

  function manejarCambio(e) {
    const limpio = e.target.value.replace(/\D/g, "").slice(0, maxLength);
    onValueChange(limpio);
    if (limpio.length >= maxLength) setTimeout(() => onAdvance?.(), 0);
  }

  return (
    <input
      ref={inputRef}
      value={value}
      inputMode={inputMode}
      pattern="\d*"
      autoComplete="off"
      spellCheck={false}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onKeyDown={manejarTecla}
      onChange={manejarCambio}
      onFocus={(e) => e.target.select()}
      className={className}
    />
  );
});

export default SegmentInput;
