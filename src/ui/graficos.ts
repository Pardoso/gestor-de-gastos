// Pantalla Gráficos: tarjetas KPI, selector de periodo y 4 gráficos Chart.js.
import {
  ArcElement, BarController, BarElement, CategoryScale, Chart, DoughnutController, Filler,
  Legend, LinearScale, LineController, LineElement, PointElement, Tooltip, type ChartConfiguration,
} from 'chart.js';
import {
  categoriaPorMes, diasEntre, PERIODOS, porCategoria, porMes, porSemana, rangoPeriodo, resumen, sumarDias, type Periodo,
} from '../stats';
import { etiquetaMes, etiquetaSemana, formatoMonto, formatoVariacion } from '../format';
import { estadoVacio, h, prefs, type Contexto } from './comun';

Chart.register(
  ArcElement, BarController, BarElement, CategoryScale, DoughnutController, Filler,
  Legend, LinearScale, LineController, LineElement, PointElement, Tooltip,
);

let graficos: { destroy(): void }[] = [];

function destruirGraficos(): void {
  graficos.forEach((g) => g.destroy());
  graficos = [];
}

const compacto = new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 });
const montoCorto = (v: number | string) => '$' + compacto.format(Number(v));

function colores() {
  const css = getComputedStyle(document.documentElement);
  const v = (n: string) => css.getPropertyValue(n).trim();
  return { texto: v('--texto-2'), rejilla: v('--borde'), acento: v('--acento'), fondo: v('--superficie') };
}

function opcionesBase(apilado = false): ChartConfiguration<'bar' | 'line'>['options'] {
  const c = colores();
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 250 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: apilado, position: 'bottom', labels: { color: c.texto, boxWidth: 12, boxHeight: 12, padding: 12 } },
      tooltip: { callbacks: { label: (it) => `${it.dataset.label ? it.dataset.label + ': ' : ''}${formatoMonto(Number(it.raw))}` } },
    },
    scales: {
      x: { stacked: apilado, ticks: { color: c.texto, maxRotation: 0, autoSkipPadding: 8 }, grid: { display: false }, border: { color: c.rejilla } },
      y: { stacked: apilado, beginAtZero: true, ticks: { color: c.texto, callback: montoCorto, maxTicksLimit: 5 }, grid: { color: c.rejilla }, border: { display: false } },
    },
  };
}

function lienzo(titulo: string, detalle?: string): { tarjeta: HTMLElement; canvas: HTMLCanvasElement } {
  const canvas = h('canvas', { role: 'img', 'aria-label': titulo });
  const tarjeta = h('section', { class: 'tarjeta grafico' },
    h('h2', { class: 'subtitulo' }, titulo),
    detalle ? h('p', { class: 'texto-2 chico' }, detalle) : null,
    h('div', { class: 'grafico-caja' }, canvas),
  );
  return { tarjeta, canvas };
}

function kpi(titulo: string, valor: string, detalle: string, clase = ''): HTMLElement {
  return h('div', { class: 'tarjeta kpi' },
    h('p', { class: 'kpi-titulo' }, titulo),
    h('p', { class: 'kpi-valor ' + clase }, valor),
    h('p', { class: 'kpi-detalle' }, detalle),
  );
}

export async function pantallaGraficos(ctx: Contexto, cont: HTMLElement): Promise<void> {
  destruirGraficos();
  const guardado = prefs.periodo();
  const periodo: Periodo = PERIODOS.some((p) => p.id === guardado) ? (guardado as Periodo) : 'mes';
  const hoy = ctx.hoy();

  const [cats, todos] = await Promise.all([ctx.repo.listarCategorias(), periodo === 'todo' ? ctx.repo.listarGastos() : Promise.resolve(null)]);
  const { desde, hasta } = rangoPeriodo(periodo, hoy, todos?.at(-1)?.fecha, todos?.[0]?.fecha);

  // Se lee también el periodo anterior (para la variación) y 12 semanas atrás (gráfico semanal).
  const dias = diasEntre(desde, hasta);
  const desdeLectura = [sumarDias(desde, -dias), sumarDias(hasta, -7 * 12)].sort()[0];
  const leidos = todos ?? (await ctx.repo.listarGastos({ desde: desdeLectura, hasta }));
  const enPeriodo = leidos.filter((g) => g.fecha >= desde && g.fecha <= hasta);

  const selector = h('div', { class: 'chips periodos', role: 'radiogroup', 'aria-label': 'Periodo' },
    ...PERIODOS.map((p) =>
      h('button', {
        class: p.id === periodo ? 'chip activo' : 'chip', type: 'button', role: 'radio', 'aria-checked': String(p.id === periodo),
        onclick: () => { prefs.setPeriodo(p.id); pantallaGraficos(ctx, cont); },
      }, p.texto),
    ),
  );

  const r = resumen(leidos, desde, hasta);
  const variacionClase = r.variacion === null ? '' : r.variacion > 0 ? 'sube' : 'baja';
  const kpis = h('div', { class: 'kpis' },
    kpi('Total', formatoMonto(r.total), `${enPeriodo.length} ${enPeriodo.length === 1 ? 'gasto' : 'gastos'}`),
    kpi('Promedio diario', formatoMonto(r.promedioDiario), `en ${r.dias} ${r.dias === 1 ? 'día' : 'días'}`),
    kpi('Gasto mayor', r.gastoMayor ? formatoMonto(r.gastoMayor.monto) : '—', r.gastoMayor?.nombre ?? 'sin gastos'),
    kpi('Variación', formatoVariacion(r.variacion), 'vs. periodo anterior', variacionClase),
  );

  const pantalla = h('div', { class: 'pantalla pila-grande' }, selector, kpis);
  cont.replaceChildren(pantalla);

  if (enPeriodo.length === 0) {
    pantalla.append(estadoVacio('Sin gastos en este periodo', 'Elige otro periodo o registra un gasto.'));
    return;
  }

  const c = colores();
  const rejilla = h('div', { class: 'rejilla-graficos' });
  pantalla.append(rejilla);

  // 1. Barras por mes
  const mes = porMes(enPeriodo, desde, hasta);
  const g1 = lienzo('Gasto por mes');
  rejilla.append(g1.tarjeta);
  graficos.push(new Chart(g1.canvas, {
    type: 'bar',
    data: { labels: mes.etiquetas.map((m) => etiquetaMes(m, mes.etiquetas.length > 4)), datasets: [{ data: mes.valores, backgroundColor: c.acento, borderRadius: 4, maxBarThickness: 48 }] },
    options: opcionesBase() as ChartConfiguration<'bar'>['options'],
  }));

  // 2. Línea por semana (últimas 12)
  const sem = porSemana(leidos, hasta, 12);
  const g2 = lienzo('Gasto por semana', 'Últimas 12 semanas (lunes a domingo)');
  rejilla.append(g2.tarjeta);
  graficos.push(new Chart(g2.canvas, {
    type: 'line',
    data: {
      labels: sem.etiquetas.map(etiquetaSemana),
      datasets: [{ data: sem.valores, borderColor: c.acento, backgroundColor: c.acento + '22', fill: true, tension: 0.3, pointRadius: 3, pointBackgroundColor: c.acento }],
    },
    options: opcionesBase() as ChartConfiguration<'line'>['options'],
  }));

  // 3. Dona por categoría
  const cat = porCategoria(enPeriodo, cats);
  const g3 = lienzo('Por categoría');
  rejilla.append(g3.tarjeta);
  graficos.push(new Chart(g3.canvas, {
    type: 'doughnut',
    data: { labels: cat.etiquetas, datasets: [{ data: cat.valores, backgroundColor: cat.colores, borderColor: c.fondo, borderWidth: 2 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      animation: { duration: 250 },
      plugins: {
        legend: { position: 'bottom', labels: { color: c.texto, boxWidth: 12, boxHeight: 12, padding: 10 } },
        tooltip: { callbacks: { label: (it) => `${it.label}: ${formatoMonto(Number(it.raw))} (${Math.round(cat.porcentajes[it.dataIndex])} %)` } },
      },
    },
  }));

  // 4. Barras apiladas categoría × mes
  const mat = categoriaPorMes(enPeriodo, cats, desde, hasta);
  const g4 = lienzo('Categorías por mes');
  rejilla.append(g4.tarjeta);
  graficos.push(new Chart(g4.canvas, {
    type: 'bar',
    data: {
      labels: mat.meses.map((m) => etiquetaMes(m, mat.meses.length > 4)),
      datasets: mat.series.map((s) => ({ label: s.categoria, data: s.valores, backgroundColor: s.color, maxBarThickness: 48 })),
    },
    options: opcionesBase(true) as ChartConfiguration<'bar'>['options'],
  }));
}

/** Para que los gráficos no queden vivos al cambiar de pantalla. */
export const salirDeGraficos = destruirGraficos;
