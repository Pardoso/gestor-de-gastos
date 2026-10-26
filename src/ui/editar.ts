// Menú de un gasto: editar o borrar (con confirmación en panel inferior).
import { validarGasto } from '../repo';
import type { Categoria, Gasto } from '../types';
import { formatoMonto, leerMonto } from '../format';
import { abrirPanel, aviso, campoMonto, chipsCategorias, confirmar, h, mensajeError, type Contexto } from './comun';

export function abrirMenuGasto(ctx: Contexto, g: Gasto, cats: Categoria[]): void {
  const cerrar = abrirPanel(g.nombre,
    h('div', { class: 'pila' },
      h('p', { class: 'texto-2' }, formatoMonto(g.monto)),
      h('button', { class: 'boton', type: 'button', onclick: () => { cerrar(); abrirEdicion(ctx, g, cats); } }, 'Editar'),
      h('button', { class: 'boton peligro-texto', type: 'button', onclick: async () => {
        cerrar();
        if (await confirmar('¿Borrar este gasto?', `${g.nombre} · ${formatoMonto(g.monto)}. No se puede deshacer.`, 'Borrar', true)) {
          try { await ctx.repo.borrarGasto(g.id); aviso('Gasto borrado'); ctx.cambio(); }
          catch (e) { aviso(mensajeError(e), true); }
        }
      } }, 'Borrar'),
    ),
  );
}

function abrirEdicion(ctx: Contexto, g: Gasto, cats: Categoria[]): void {
  let categoriaId = g.categoriaId;
  const monto = campoMonto(g.monto);
  const nombre = h('input', { class: 'campo', type: 'text', value: g.nombre, maxlength: 100, autocomplete: 'off', 'aria-label': 'Nombre', enterkeyhint: 'done' });
  const fecha = h('input', { class: 'campo', type: 'date', value: g.fecha, 'aria-label': 'Fecha', required: true });
  const error = h('p', { class: 'error-texto', role: 'alert' });

  const form = h('form', { class: 'pila', novalidate: true },
    h('label', { class: 'etiqueta' }, 'Monto', h('div', { class: 'monto-envoltura' }, h('span', { class: 'signo' }, '$'), monto)),
    h('label', { class: 'etiqueta' }, 'Nombre', nombre),
    h('div', { class: 'etiqueta' }, 'Categoría', chipsCategorias(cats, categoriaId, (id) => { categoriaId = id; })),
    h('label', { class: 'etiqueta' }, 'Fecha', fecha),
    error,
    h('button', { class: 'boton primario', type: 'submit' }, 'Guardar cambios'),
  );
  const cerrar = abrirPanel('Editar gasto', form);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const editado: Gasto = { id: g.id, nombre: nombre.value, monto: leerMonto(monto.value), categoriaId, fecha: fecha.value };
    try {
      validarGasto(editado);
      await ctx.repo.editarGasto(editado);
      cerrar();
      aviso('Cambios guardados');
      ctx.cambio();
    } catch (e) {
      error.textContent = mensajeError(e);
    }
  });
}
