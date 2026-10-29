async function manejarRespuesta(r) {
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    let mensaje = j.error || "Error del servidor";
    if (r.status === 401) mensaje = j.error || "Sesión expirada. Iniciá sesión nuevamente.";
    else if (r.status === 403) mensaje = j.error || "No tenés autorización para realizar esta acción.";
    else if (r.status === 404) mensaje = j.error || "El recurso solicitado no existe.";
    else if (r.status === 429) mensaje = j.error || "Demasiadas intentos. Probá más tarde.";
    else if (r.status >= 500) mensaje = j.error || "Error interno del servidor.";
    const e = new Error(mensaje);
    e.datos = j;
    e.status = r.status;
    throw e;
  }
  return j;
}

import { getCsrfToken } from "../../utils/csrf";

/**
 * Ante un 401 lo más probable es que la sesión se haya caído. Se manda al
 * login en vez de dejar un error suelto en la pantalla.
 */
function manejarSesionCaida(mensaje) {
  if (typeof window === "undefined") return mensaje;
  const enLogin = window.location.pathname.startsWith("/login");
  if (!enLogin) {
    const volver = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/login/?expirada=1&next=${volver}`);
  }
  return mensaje;
}

export async function apiGet(url) {
  const r = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  return manejarRespuesta(r);
}

export async function apiPost(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCsrfToken(),
    },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(body),
  });
  return manejarRespuesta(r);
}

/**
 * Descarga un archivo (PDF, backup) con la sesión de la app.
 *
 * No se usa un <a href> porque el navegador sólo renderiza el cuerpo de la
 * respuesta: si el servidor devolvía {"error": "No autenticado"} con 401, la
 * persona veía el JSON crudo como si fuera la página. Con fetch se puede
 * mirar el status y avisar con un mensaje en la interfaz.
 */
export async function apiDescargar(url, nombrePorDefecto) {
  const r = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  if (!r.ok) {
    let mensaje = "No se pudo descargar el archivo.";
    try {
      const j = await r.json();
      if (j && j.error) mensaje = j.error;
    } catch {
      // respuesta sin JSON (p. ej. HTML de error): se deja el mensaje por defecto
    }
    if (r.status === 401) {
      manejarSesionCaida("Tu sesión se cayó. Volvé a iniciar sesión para descargar.");
    }
    const e = new Error(mensaje);
    e.status = r.status;
    throw e;
  }

  // El nombre real viene en Content-Disposition; si no, se usa el sugerido.
  const cd = r.headers.get("Content-Disposition") || "";
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  const simple = /filename="?([^";]+)"?/i.exec(cd);
  const nombre = utf8 ? decodeURIComponent(utf8[1]) : simple ? simple[1] : nombrePorDefecto;

  const blob = await r.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = nombre || "descarga";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Libera el blob: sin esto el objeto queda retenido en memoria.
  setTimeout(() => URL.revokeObjectURL(href), 10000);
  return nombre;
}

export function formatearFecha(iso, conHora = false) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const opciones = conHora
    ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "2-digit", year: "numeric" };
  return d.toLocaleDateString("es-AR", opciones);
}

export function formatearBytes(bytes) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function hoyIso() {
  return new Date().toISOString().slice(0, 10);
}
