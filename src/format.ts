// Formato de montos y fechas (es-CL). Funciones puras, sin estado.

const fmtMonto = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const fmtNumero = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });
const fmtFecha = new Intl.DateTimeFormat('es-CL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtFechaAnio = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtMes = new Intl.DateTimeFormat('es-CL', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtMesCorto = new Intl.DateTimeFormat('es-CL', { month: 'short', timeZone: 'UTC' });

/** 1234567 → "$1.234.567" */
export function formatoMonto(n: number): string {
  return fmtMonto.format(Math.round(n)).replace(/\s/g, '');
}

/** 1234567 → "1.234.567" (para el campo monto mientras se escribe). */
export function formatoNumero(n: number): string {
  return fmtNumero.format(n);
}

/** "$1.234.567" o "1.234" → 1234567 / 1234. Devuelve NaN si no hay dígitos. */
export function leerMonto(texto: string): number {
  const digitos = texto.replace(/\D/g, '');
  return digitos === '' ? NaN : Number(digitos);
}

/** '2026-10-26' → "lun, 26 oct" (con año si no es el año de referencia). */
export function formatoFecha(fecha: string, anioActual?: number): string {
  const d = new Date(fecha + 'T00:00:00Z');
  return anioActual !== undefined && d.getUTCFullYear() !== anioActual ? fmtFechaAnio.format(d) : fmtFecha.format(d);
}

/** '2026-10' → "oct 2026" */
export function etiquetaMes(mes: string, corto = false): string {
  const d = new Date(mes + '-01T00:00:00Z');
  return (corto ? fmtMesCorto : fmtMes).format(d).replace('.', '');
}

/** '2026-S43' → "S43" */
export function etiquetaSemana(semana: string): string {
  return semana.slice(5);
}

/** 0.253 → "+25 %", null → "sin datos" */
export function formatoVariacion(v: number | null): string {
  if (v === null) return 'sin datos';
  const p = Math.round(v * 100);
  return `${p > 0 ? '+' : ''}${p} %`;
}

/** Fecha local del teléfono como 'AAAA-MM-DD' (hoy, según el usuario). */
export function fechaLocal(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dia}`;
}
