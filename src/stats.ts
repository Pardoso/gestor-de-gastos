// Cálculos puros: reciben datos y devuelven datos. Sin base de datos ni pantalla.
// Las fechas se procesan en UTC para que la zona horaria no mueva un gasto de día.
import type { Categoria, Gasto, MatrizCategoriaMes, ResumenKpi, Serie, SerieCategorias } from './types';

const DIA_MS = 86_400_000;
const COLOR_SIN_CATEGORIA = '#8A8F98';

const aUtc = (fecha: string): Date => new Date(fecha + 'T00:00:00Z');
const aTexto = (d: Date): string => d.toISOString().slice(0, 10);

export function sumarDias(fecha: string, dias: number): string {
  const d = aUtc(fecha);
  d.setUTCDate(d.getUTCDate() + dias);
  return aTexto(d);
}

/** Días entre dos fechas, contando ambas (mismo día = 1). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta).getTime() - aUtc(desde).getTime()) / DIA_MS) + 1;
}

export const mesDe = (fecha: string): string => fecha.slice(0, 7);

/** Semana ISO de una fecha 'AAAA-MM-DD' (lunes a domingo), p. ej. '2026-S43'. */
export function semanaIso(fecha: string): string {
  const d = aUtc(fecha);
  const dia = d.getUTCDay() || 7; // lunes = 1 ... domingo = 7
  d.setUTCDate(d.getUTCDate() + 4 - dia); // jueves de esa semana
  const anio = d.getUTCFullYear();
  const dias = (d.getTime() - Date.UTC(anio, 0, 1)) / DIA_MS;
  return `${anio}-S${String(Math.floor(dias / 7) + 1).padStart(2, '0')}`;
}

/** Lista de meses 'AAAA-MM' desde..hasta, ambos incluidos. */
export function mesesEntre(desdeMes: string, hastaMes: string): string[] {
  const res: string[] = [];
  let [a, m] = desdeMes.split('-').map(Number);
  const [ah, mh] = hastaMes.split('-').map(Number);
  while (a < ah || (a === ah && m <= mh)) {
    res.push(`${a}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; a++; }
  }
  return res;
}

function rangoDeGastos(gastos: Gasto[]): { desde: string; hasta: string } | null {
  if (gastos.length === 0) return null;
  let desde = gastos[0].fecha;
  let hasta = gastos[0].fecha;
  for (const g of gastos) {
    if (g.fecha < desde) desde = g.fecha;
    if (g.fecha > hasta) hasta = g.fecha;
  }
  return { desde, hasta };
}

function sumarPor(gastos: Gasto[], clave: (g: Gasto) => string | number): Map<string | number, number> {
  const m = new Map<string | number, number>();
  for (const g of gastos) m.set(clave(g), (m.get(clave(g)) ?? 0) + g.monto);
  return m;
}

const total = (gastos: Gasto[]): number => gastos.reduce((s, g) => s + g.monto, 0);

/** Total por mes. Si se da un rango, incluye los meses sin gastos (en 0). */
export function porMes(gastos: Gasto[], desde?: string, hasta?: string): Serie {
  const r = rangoDeGastos(gastos);
  const ini = desde ?? r?.desde;
  const fin = hasta ?? r?.hasta;
  if (!ini || !fin) return { etiquetas: [], valores: [] };
  const sumas = sumarPor(gastos, (g) => mesDe(g.fecha));
  const etiquetas = mesesEntre(mesDe(ini), mesDe(fin));
  return { etiquetas, valores: etiquetas.map((m) => sumas.get(m) ?? 0) };
}

/** Total por semana ISO: las últimas `cuantas` semanas que terminan en la semana de `hasta`. */
export function porSemana(gastos: Gasto[], hasta?: string, cuantas = 12): Serie {
  const fin = hasta ?? rangoDeGastos(gastos)?.hasta;
  if (!fin) return { etiquetas: [], valores: [] };
  const sumas = sumarPor(gastos, (g) => semanaIso(g.fecha));
  const etiquetas: string[] = [];
  for (let i = cuantas - 1; i >= 0; i--) etiquetas.push(semanaIso(sumarDias(fin, -7 * i)));
  return { etiquetas, valores: etiquetas.map((s) => sumas.get(s) ?? 0) };
}

/** Total y porcentaje por categoría, de mayor a menor. Solo categorías con gastos. */
export function porCategoria(gastos: Gasto[], categorias: Categoria[]): SerieCategorias {
  const sumas = sumarPor(gastos, (g) => g.categoriaId);
  const t = total(gastos);
  const filas = [...sumas.entries()]
    .map(([id, valor]) => {
      const c = categorias.find((x) => x.id === id);
      return { nombre: c?.nombre ?? 'Sin categoría', color: c?.color ?? COLOR_SIN_CATEGORIA, valor };
    })
    .sort((a, b) => b.valor - a.valor);
  return {
    etiquetas: filas.map((f) => f.nombre),
    valores: filas.map((f) => f.valor),
    colores: filas.map((f) => f.color),
    porcentajes: filas.map((f) => (t > 0 ? (f.valor / t) * 100 : 0)),
  };
}

/** Matriz mes × categoría para barras apiladas. */
export function categoriaPorMes(gastos: Gasto[], categorias: Categoria[], desde?: string, hasta?: string): MatrizCategoriaMes {
  const meses = porMes(gastos, desde, hasta).etiquetas;
  const usadas = new Set(gastos.map((g) => g.categoriaId));
  const series = [...usadas]
    .map((id) => {
      const c = categorias.find((x) => x.id === id);
      const sumas = sumarPor(gastos.filter((g) => g.categoriaId === id), (g) => mesDe(g.fecha));
      return {
        categoria: c?.nombre ?? 'Sin categoría',
        color: c?.color ?? COLOR_SIN_CATEGORIA,
        valores: meses.map((m) => sumas.get(m) ?? 0),
        orden: categorias.findIndex((x) => x.id === id),
      };
    })
    .sort((a, b) => a.orden - b.orden)
    .map(({ orden: _o, ...s }) => s);
  return { meses, series };
}

/**
 * KPIs del periodo [desde, hasta]. La variación compara contra el periodo anterior
 * de igual largo, por eso `gastos` debe incluir también ese periodo.
 */
export function resumen(gastos: Gasto[], desde: string, hasta: string): ResumenKpi {
  const dias = Math.max(1, diasEntre(desde, hasta));
  const actuales = gastos.filter((g) => g.fecha >= desde && g.fecha <= hasta);
  const antHasta = sumarDias(desde, -1);
  const antDesde = sumarDias(desde, -dias);
  const totalActual = total(actuales);
  const totalAnterior = total(gastos.filter((g) => g.fecha >= antDesde && g.fecha <= antHasta));
  let gastoMayor: Gasto | null = null;
  for (const g of actuales) if (!gastoMayor || g.monto > gastoMayor.monto) gastoMayor = g;
  return {
    total: totalActual,
    dias,
    promedioDiario: totalActual / dias,
    gastoMayor,
    totalAnterior,
    variacion: totalAnterior === 0 ? null : (totalActual - totalAnterior) / totalAnterior,
  };
}

export type Periodo = 'mes' | '3m' | '6m' | 'anio' | 'todo';

export const PERIODOS: { id: Periodo; texto: string }[] = [
  { id: 'mes', texto: 'Este mes' },
  { id: '3m', texto: '3 meses' },
  { id: '6m', texto: '6 meses' },
  { id: 'anio', texto: 'Este año' },
  { id: 'todo', texto: 'Todo' },
];

/** Rango de fechas de un periodo, terminando hoy. */
export function rangoPeriodo(p: Periodo, hoy: string, primeraFecha?: string, ultimaFecha?: string): { desde: string; hasta: string } {
  const [a, m] = hoy.split('-').map(Number);
  const inicioMes = (mesesAtras: number) => {
    const d = new Date(Date.UTC(a, m - 1 - mesesAtras, 1));
    return aTexto(d);
  };
  switch (p) {
    case 'mes': return { desde: inicioMes(0), hasta: hoy };
    case '3m': return { desde: inicioMes(2), hasta: hoy };
    case '6m': return { desde: inicioMes(5), hasta: hoy };
    case 'anio': return { desde: `${a}-01-01`, hasta: hoy };
    case 'todo': {
      const desde = primeraFecha && primeraFecha < hoy ? primeraFecha : inicioMes(0);
      const hasta = ultimaFecha && ultimaFecha > hoy ? ultimaFecha : hoy;
      return { desde, hasta };
    }
  }
}
