// Panel de ajustes: respaldo (exportar / importar) y categorías.
import { exportar, importar, validarRespaldo, type TipoExportar } from '../backup';
import type { Categoria } from '../types';
import { formatoFecha } from '../format';
import { abrirPanel, aviso, confirmar, h, mensajeError, prefs, puntoColor, type Contexto } from './comun';

const PALETA = ['#E8833A', '#3B82C4', '#8B6BD1', '#D9534F', '#D9A520', '#2BA39B', '#8A8F98', '#4CAF50', '#E05A9C', '#5C6BC0'];

export async function abrirAjustes(ctx: Contexto): Promise<void> {
  const cats = await ctx.repo.listarCategorias();
  const hoy = ctx.hoy();

  const exportarComo = async (tipo: TipoExportar) => {
    try {
      await exportar(ctx.repo, tipo, hoy);
      if (tipo === 'json') { prefs.setUltimoRespaldo(hoy); await ctx.cambio(); }
      aviso(tipo === 'json' ? 'Respaldo listo' : 'CSV listo');
    } catch (e) {
      // Cerrar el menú Compartir sin elegir nada también llega aquí.
      if (!/cancel/i.test(mensajeError(e))) aviso(mensajeError(e), true);
    }
  };

  const archivo = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  archivo.addEventListener('change', async () => {
    const f = archivo.files?.[0];
    archivo.value = '';
    if (!f) return;
    try {
      const datos = validarRespaldo(await f.text());
      cerrar();
      preguntarModoImportar(datos.gastos.length, datos.categorias.length, async (modo) => {
        try {
          const n = await importar(ctx.repo, datos, modo);
          aviso(modo === 'reemplazar' ? `Respaldo restaurado: ${n} gastos` : `Se agregaron ${n} gastos`);
          await ctx.cambio();
        } catch (e) { aviso(mensajeError(e), true); }
      });
    } catch (e) {
      aviso(mensajeError(e), true);
    }
  });

  const listaCats = h('div', { class: 'lista' },
    ...cats.map((c) =>
      h('button', { class: 'fila-cat', type: 'button', onclick: () => { cerrar(); editarCategoria(ctx, c, cats); } },
        puntoColor(c.color), h('span', {}, c.nombre), h('span', { class: 'texto-2 chico' }, 'Editar')),
    ),
  );

  const cuenta = ctx.cuenta;
  const contenido = h('div', { class: 'pila-grande' },
    cuenta && h('section', { class: 'pila' },
      h('h3', { class: 'subtitulo' }, 'Cuenta'),
      h('p', { class: 'texto-2 chico' }, `Sesión iniciada como ${cuenta.correo}.`),
      h('button', { class: 'boton', type: 'button', onclick: async () => {
        cerrar();
        if (await confirmar('¿Cerrar sesión?', 'Tus gastos quedan guardados en tu cuenta. Para verlos de nuevo tendrás que iniciar sesión.', 'Cerrar sesión')) {
          try { await cuenta.cerrarSesion(); } catch (e) { aviso(mensajeError(e), true); }
        }
      } }, 'Cerrar sesión'),
    ),
    h('section', { class: 'pila' },
      h('h3', { class: 'subtitulo' }, 'Respaldo'),
      h('p', { class: 'texto-2 chico' }, `Tus gastos se sincronizan con tu cuenta. El respaldo es una copia extra por si acaso. Último respaldo: ${formatoFecha(prefs.ultimoRespaldo(), Number(hoy.slice(0, 4)))}.`),
      h('button', { class: 'boton primario', type: 'button', onclick: () => exportarComo('json') }, 'Exportar respaldo (JSON)'),
      h('button', { class: 'boton', type: 'button', onclick: () => exportarComo('csv') }, 'Exportar para Excel (CSV)'),
      h('button', { class: 'boton', type: 'button', onclick: () => archivo.click() }, 'Importar respaldo'),
      archivo,
    ),
    h('section', { class: 'pila' },
      h('h3', { class: 'subtitulo' }, 'Categorías'),
      listaCats,
      h('button', { class: 'boton', type: 'button', onclick: () => { cerrar(); editarCategoria(ctx, null, cats); } }, '+ Nueva categoría'),
    ),
    h('section', { class: 'pila' },
      h('h3', { class: 'subtitulo' }, 'Zona de cuidado'),
      h('button', { class: 'boton peligro-texto', type: 'button', onclick: async () => {
        cerrar();
        if (await confirmar('¿Borrar todos los gastos?', 'Se borran todos los gastos de tu cuenta, en todos tus equipos. Las categorías se mantienen. Exporta un respaldo antes si lo necesitas.', 'Borrar todo', true)) {
          await ctx.repo.reemplazarTodo({ categorias: await ctx.repo.listarCategorias(), gastos: [] });
          aviso('Gastos borrados');
          await ctx.cambio();
        }
      } }, 'Borrar todos los gastos'),
    ),
  );
  const cerrar = abrirPanel('Ajustes', contenido);
}

function preguntarModoImportar(nGastos: number, nCats: number, elegir: (m: 'reemplazar' | 'combinar') => void): void {
  const cerrar = abrirPanel('Importar respaldo',
    h('div', { class: 'pila' },
      h('p', { class: 'texto-2' }, `El archivo trae ${nGastos} gastos y ${nCats} categorías.`),
      h('button', { class: 'boton primario', type: 'button', onclick: () => { cerrar(); elegir('combinar'); } }, 'Combinar con mis datos'),
      h('p', { class: 'texto-2 chico' }, 'Agrega lo que falte. Los gastos idénticos no se duplican.'),
      h('button', { class: 'boton peligro-texto', type: 'button', onclick: async () => {
        cerrar();
        if (await confirmar('¿Reemplazar todo?', 'Se borrarán los gastos y categorías actuales y quedarán los del respaldo.', 'Reemplazar', true)) elegir('reemplazar');
      } }, 'Reemplazar mis datos'),
    ),
  );
}

function editarCategoria(ctx: Contexto, c: Categoria | null, cats: Categoria[]): void {
  let color = c?.color ?? PALETA.find((p) => !cats.some((x) => x.color === p)) ?? PALETA[0];
  const nombre = h('input', { class: 'campo', type: 'text', value: c?.nombre ?? '', maxlength: 40, placeholder: 'Nombre', 'aria-label': 'Nombre de la categoría' });
  const error = h('p', { class: 'error-texto', role: 'alert' });

  const muestras = h('div', { class: 'paleta', role: 'radiogroup', 'aria-label': 'Color' });
  const pintar = () => muestras.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    b.classList.toggle('activo', b.dataset.color === color);
    b.setAttribute('aria-checked', String(b.dataset.color === color));
  });
  for (const p of PALETA) {
    const b = h('button', { type: 'button', role: 'radio', 'data-color': p, 'aria-label': `Color ${p}` });
    b.style.background = p;
    b.addEventListener('click', () => { color = p; pintar(); });
    muestras.append(b);
  }
  pintar();

  const form = h('form', { class: 'pila', novalidate: true },
    h('label', { class: 'etiqueta' }, 'Nombre', nombre),
    h('div', { class: 'etiqueta' }, 'Color en los gráficos', muestras),
    error,
    h('button', { class: 'boton primario', type: 'submit' }, c ? 'Guardar' : 'Crear categoría'),
    c && h('button', { class: 'boton peligro-texto', type: 'button', onclick: () => { cerrar(); borrarCategoria(ctx, c, cats); } }, 'Borrar categoría'),
  );
  const cerrar = abrirPanel(c ? 'Editar categoría' : 'Nueva categoría', form);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      if (c) await ctx.repo.editarCategoria({ id: c.id, nombre: nombre.value, color });
      else await ctx.repo.agregarCategoria({ nombre: nombre.value, color });
      cerrar();
      aviso(c ? 'Categoría guardada' : 'Categoría creada');
      await ctx.cambio();
    } catch (e) {
      error.textContent = mensajeError(e);
    }
  });
}

async function borrarCategoria(ctx: Contexto, c: Categoria, cats: Categoria[]): Promise<void> {
  const usados = await ctx.repo.contarGastos(c.id);
  if (usados === 0) {
    if (await confirmar(`¿Borrar "${c.nombre}"?`, 'No tiene gastos asociados.', 'Borrar', true)) {
      await ctx.repo.borrarCategoria(c.id);
      aviso('Categoría borrada');
      await ctx.cambio();
    }
    return;
  }
  const otras = cats.filter((x) => x.id !== c.id);
  if (otras.length === 0) { aviso('Es la única categoría: crea otra antes de borrarla.', true); return; }
  // Tiene gastos: hay que moverlos a otra categoría antes de borrar.
  const destino = h('select', { class: 'campo', 'aria-label': 'Mover gastos a' }, ...otras.map((x) => h('option', { value: x.id }, x.nombre)));
  const cerrar = abrirPanel(`Borrar "${c.nombre}"`,
    h('div', { class: 'pila' },
      h('p', { class: 'texto-2' }, `Tiene ${usados} ${usados === 1 ? 'gasto' : 'gastos'}. Elige a qué categoría moverlos.`),
      destino,
      h('button', { class: 'boton peligro', type: 'button', onclick: async () => {
        try {
          await ctx.repo.borrarCategoria(c.id, Number(destino.value));
          cerrar();
          aviso('Gastos movidos y categoría borrada');
          await ctx.cambio();
        } catch (e) { aviso(mensajeError(e), true); }
      } }, 'Mover gastos y borrar'),
    ),
  );
}
