// Pantalla Registrar: formulario de gasto rápido y últimos 5 gastos.
import { validarGasto } from '../repo';
import { diasEntre } from '../stats';
import { leerMonto } from '../format';
import { aviso, campoMonto, chipsCategorias, estadoVacio, h, mensajeError, prefs, tarjetaGasto, type Contexto } from './comun';
import { abrirMenuGasto } from './editar';

export async function pantallaRegistrar(ctx: Contexto, cont: HTMLElement, abrirAjustes: () => void): Promise<void> {
  const [cats, todos] = await Promise.all([ctx.repo.listarCategorias(), ctx.repo.listarGastos()]);
  const mapaCats = new Map(cats.map((c) => [c.id, c]));
  const hoy = ctx.hoy();

  // La app recuerda la última categoría usada.
  let categoriaId: number | null = prefs.ultimaCategoria();
  if (categoriaId === null || !mapaCats.has(categoriaId)) categoriaId = cats[0]?.id ?? null;

  const monto = campoMonto();
  const nombre = h('input', {
    class: 'campo', type: 'text', placeholder: '¿En qué gastaste?', maxlength: 100, autocomplete: 'off',
    'aria-label': 'Nombre del gasto', enterkeyhint: 'done', list: 'nombres-previos',
  });
  const fecha = h('input', { class: 'campo campo-fecha', type: 'date', value: hoy, 'aria-label': 'Fecha', required: true });
  const error = h('p', { class: 'error-texto', role: 'alert' });

  // Sugerencias con nombres usados antes (los más recientes primero).
  const nombres = [...new Set(todos.map((g) => g.nombre))].slice(0, 50);
  const lista = h('datalist', { id: 'nombres-previos' }, ...nombres.map((n) => h('option', { value: n })));

  monto.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nombre.focus(); } });

  const form = h('form', { class: 'tarjeta pila', novalidate: true },
    h('div', { class: 'monto-envoltura grande' }, h('span', { class: 'signo' }, '$'), monto),
    nombre,
    lista,
    chipsCategorias(cats, categoriaId, (id) => { categoriaId = id; }),
    h('div', { class: 'fila-fecha' }, h('span', { class: 'texto-2' }, 'Fecha'), fecha),
    error,
    h('button', { class: 'boton primario', type: 'submit' }, 'Agregar'),
  );

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.textContent = '';
    if (categoriaId === null) { error.textContent = 'Primero crea una categoría.'; return; }
    const g = { nombre: nombre.value, monto: leerMonto(monto.value), categoriaId, fecha: fecha.value };
    try {
      validarGasto(g);
      await ctx.repo.agregarGasto(g);
      prefs.setUltimaCategoria(categoriaId);
      aviso('Gasto agregado');
      await ctx.cambio(); // vuelve a dibujar la pantalla con la lista actualizada
      document.querySelector<HTMLInputElement>('.campo-monto')?.focus();
    } catch (e) {
      error.textContent = mensajeError(e);
      (isNaN(g.monto) || g.monto <= 0 ? monto : nombre).focus();
    }
  });

  // Aviso discreto si pasaron 30 días desde el último respaldo.
  const dias = diasEntre(prefs.ultimoRespaldo(), hoy) - 1;
  const avisoRespaldo =
    todos.length > 0 && dias >= 30
      ? h('button', { class: 'banda-respaldo', type: 'button', onclick: abrirAjustes },
          `Han pasado ${dias} días sin respaldo. Toca para exportar.`)
      : null;

  const ultimos = todos.slice(0, 5);
  const anio = Number(hoy.slice(0, 4));
  const seccion = h('section', { class: 'pila' },
    h('h2', { class: 'subtitulo' }, 'Últimos gastos'),
    ultimos.length
      ? h('div', { class: 'lista' }, ...ultimos.map((g) => tarjetaGasto(g, mapaCats, anio, (x) => abrirMenuGasto(ctx, x, cats))))
      : estadoVacio('Aún no hay gastos', 'Escribe el monto, el nombre y elige una categoría.'),
  );

  cont.replaceChildren(h('div', { class: 'pantalla pila-grande' }, avisoRespaldo, form, seccion));
}
