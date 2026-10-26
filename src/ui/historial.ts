// Pantalla Historial: lista de gastos en tarjetas, con filtros, editar y borrar.
import type { FiltroGastos, Gasto } from '../types';
import { etiquetaMes, formatoMonto } from '../format';
import { mesDe } from '../stats';
import { estadoVacio, h, tarjetaGasto, type Contexto } from './comun';
import { abrirMenuGasto } from './editar';

const POR_PAGINA = 100;

// Los filtros se mantienen mientras la app está abierta.
const filtro: FiltroGastos = {};
let mostrar = POR_PAGINA;

export async function pantallaHistorial(ctx: Contexto, cont: HTMLElement): Promise<void> {
  const cats = await ctx.repo.listarCategorias();
  const mapaCats = new Map(cats.map((c) => [c.id, c]));
  const anio = Number(ctx.hoy().slice(0, 4));

  const desde = h('input', { class: 'campo', type: 'date', value: filtro.desde ?? '', 'aria-label': 'Desde' });
  const hasta = h('input', { class: 'campo', type: 'date', value: filtro.hasta ?? '', 'aria-label': 'Hasta' });
  const categoria = h('select', { class: 'campo', 'aria-label': 'Categoría' },
    h('option', { value: '' }, 'Todas las categorías'),
    ...cats.map((c) => h('option', { value: c.id, selected: filtro.categoriaId === c.id }, c.nombre)),
  );
  const limpiar = h('button', { class: 'boton chico', type: 'button' }, 'Limpiar');
  const resultados = h('div', { class: 'pila' });

  const pintar = async () => {
    const gastos = await ctx.repo.listarGastos(filtro);
    const total = gastos.reduce((s, g) => s + g.monto, 0);
    limpiar.hidden = !filtro.desde && !filtro.hasta && filtro.categoriaId === undefined;

    if (gastos.length === 0) {
      resultados.replaceChildren(estadoVacio('Sin gastos', limpiar.hidden ? 'Los gastos que registres aparecerán aquí.' : 'Ningún gasto coincide con los filtros.'));
      return;
    }

    // Agrupar por mes, con subtotal.
    const visibles = gastos.slice(0, mostrar);
    const grupos = new Map<string, Gasto[]>();
    for (const g of visibles) {
      const m = mesDe(g.fecha);
      if (!grupos.has(m)) grupos.set(m, []);
      grupos.get(m)!.push(g);
    }
    const totalesMes = new Map<string, number>();
    for (const g of gastos) totalesMes.set(mesDe(g.fecha), (totalesMes.get(mesDe(g.fecha)) ?? 0) + g.monto);

    resultados.replaceChildren(
      h('p', { class: 'resumen-lista' }, h('span', {}, `${gastos.length} ${gastos.length === 1 ? 'gasto' : 'gastos'}`), h('strong', {}, formatoMonto(total))),
      ...[...grupos].map(([mes, lista]) =>
        h('section', { class: 'grupo-mes' },
          h('h2', { class: 'subtitulo fila-entre' }, h('span', {}, etiquetaMes(mes)), h('span', { class: 'texto-2' }, formatoMonto(totalesMes.get(mes) ?? 0))),
          h('div', { class: 'lista' }, ...lista.map((g) => tarjetaGasto(g, mapaCats, anio, (x) => abrirMenuGasto(ctx, x, cats)))),
        ),
      ),
      gastos.length <= mostrar ? '' :
        h('button', { class: 'boton', type: 'button', onclick: () => { mostrar += POR_PAGINA; pintar(); } }, `Ver más (${gastos.length - mostrar} restantes)`),
    );
  };

  const alCambiarFiltro = () => {
    filtro.desde = desde.value || undefined;
    filtro.hasta = hasta.value || undefined;
    filtro.categoriaId = categoria.value ? Number(categoria.value) : undefined;
    mostrar = POR_PAGINA;
    pintar();
  };
  desde.addEventListener('change', alCambiarFiltro);
  hasta.addEventListener('change', alCambiarFiltro);
  categoria.addEventListener('change', alCambiarFiltro);
  limpiar.addEventListener('click', () => { desde.value = ''; hasta.value = ''; categoria.value = ''; alCambiarFiltro(); });

  cont.replaceChildren(
    h('div', { class: 'pantalla pila-grande' },
      h('div', { class: 'tarjeta filtros' },
        h('label', { class: 'etiqueta' }, 'Desde', desde),
        h('label', { class: 'etiqueta' }, 'Hasta', hasta),
        h('div', { class: 'filtro-cat' }, categoria, limpiar),
      ),
      resultados,
    ),
  );
  await pintar();
}
