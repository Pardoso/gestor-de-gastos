// Utilidades de interfaz compartidas por las pantallas.
// Todo texto del usuario se inserta como texto (textContent), nunca como HTML.
import type { Repositorio } from '../repo';
import type { Categoria, Gasto } from '../types';
import { fechaLocal, formatoFecha, formatoMonto } from '../format';

export interface Contexto {
  repo: Repositorio;
  hoy: () => string;
  /** Avisar que cambiaron los datos (para que otras pantallas se refresquen). */
  cambio: () => Promise<void>;
}

type Hijo = Node | string | null | undefined | false;
type Atributos = Record<string, string | number | boolean | EventListener | undefined>;

/** Crea un elemento: h('button', { class: 'x', onclick: fn }, 'Texto') */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Atributos = {}, ...hijos: Hijo[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of hijos) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** Íconos SVG fijos (constantes del código, no datos del usuario). */
export const ICONOS = {
  agregar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  lista: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
  grafico: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>',
  ajustes: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
};

export function icono(nombre: keyof typeof ICONOS): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = 'icono';
  s.innerHTML = ICONOS[nombre];
  return s;
}

// ---------- Panel inferior ----------

const paneles: { cerrar: () => void }[] = [];

export function hayPanelAbierto(): boolean {
  return paneles.length > 0;
}

export function cerrarPanelSuperior(): void {
  paneles.at(-1)?.cerrar();
}

/** Abre un panel que sube desde abajo. Devuelve la función para cerrarlo. */
export function abrirPanel(titulo: string, contenido: Node, alCerrar?: () => void): () => void {
  const fondo = h('div', { class: 'panel-fondo' });
  const panel = h('section', { class: 'panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
    h('div', { class: 'panel-asa', 'aria-hidden': 'true' }),
    h('h2', { class: 'panel-titulo' }, titulo),
    contenido,
  );
  let cerrado = false;
  const entrada = {
    cerrar: () => {
      if (cerrado) return;
      cerrado = true;
      paneles.splice(paneles.indexOf(entrada), 1);
      fondo.classList.remove('visible');
      panel.classList.remove('visible');
      setTimeout(() => { fondo.remove(); panel.remove(); }, 200);
      alCerrar?.();
    },
  };
  fondo.addEventListener('click', entrada.cerrar);
  document.body.append(fondo, panel);
  paneles.push(entrada);
  requestAnimationFrame(() => { fondo.classList.add('visible'); panel.classList.add('visible'); });
  return entrada.cerrar;
}

/** Pide confirmación en un panel inferior. */
export function confirmar(titulo: string, mensaje: string, textoBoton: string, peligro = false): Promise<boolean> {
  return new Promise((resolver) => {
    let respondido = false;
    const responder = (v: boolean) => { respondido = true; resolver(v); cerrar(); };
    const cerrar = abrirPanel(titulo,
      h('div', { class: 'pila' },
        h('p', { class: 'texto-2' }, mensaje),
        h('button', { class: peligro ? 'boton peligro' : 'boton primario', type: 'button', onclick: () => responder(true) }, textoBoton),
        h('button', { class: 'boton', type: 'button', onclick: () => responder(false) }, 'Cancelar'),
      ),
      () => { if (!respondido) resolver(false); },
    );
  });
}

let temporizadorAviso: number | undefined;

/** Mensaje breve que aparece sobre la barra inferior. */
export function aviso(texto: string, error = false): void {
  document.querySelector('.aviso')?.remove();
  const el = h('div', { class: error ? 'aviso error' : 'aviso', role: 'status' }, texto);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('visible'));
  clearTimeout(temporizadorAviso);
  temporizadorAviso = window.setTimeout(() => { el.classList.remove('visible'); setTimeout(() => el.remove(), 250); }, error ? 4000 : 2200);
}

export function mensajeError(e: unknown): string {
  return e instanceof Error ? e.message : 'Ocurrió un error inesperado.';
}

// ---------- Preferencias (por teléfono) ----------

function leerPref(clave: string): string | null {
  try { return localStorage.getItem('control-gastos:' + clave); } catch { return null; }
}
function guardarPref(clave: string, valor: string): void {
  try { localStorage.setItem('control-gastos:' + clave, valor); } catch { /* sin almacenamiento */ }
}

export const prefs = {
  ultimaCategoria: (): number | null => { const v = Number(leerPref('ultimaCategoria')); return Number.isInteger(v) && v > 0 ? v : null; },
  setUltimaCategoria: (id: number) => guardarPref('ultimaCategoria', String(id)),
  /** Fecha 'AAAA-MM-DD' del último respaldo. La primera vez se toma como el día de instalación. */
  ultimoRespaldo: (): string => {
    const v = leerPref('ultimoRespaldo');
    if (v) return v;
    const hoy = fechaLocal();
    guardarPref('ultimoRespaldo', hoy);
    return hoy;
  },
  setUltimoRespaldo: (f: string) => guardarPref('ultimoRespaldo', f),
  periodo: (): string | null => leerPref('periodo'),
  setPeriodo: (p: string) => guardarPref('periodo', p),
};

// ---------- Componentes ----------

export function puntoColor(color: string): HTMLSpanElement {
  const s = h('span', { class: 'punto', 'aria-hidden': 'true' });
  s.style.background = color;
  return s;
}

/** Tarjeta de un gasto, con menú opcional. */
export function tarjetaGasto(g: Gasto, cats: Map<number, Categoria>, anioActual: number, alMenu?: (g: Gasto) => void): HTMLElement {
  const c = cats.get(g.categoriaId);
  return h('article', { class: 'tarjeta-gasto' },
    puntoColor(c?.color ?? '#8A8F98'),
    h('div', { class: 'tg-texto' },
      h('div', { class: 'tg-nombre' }, g.nombre),
      h('div', { class: 'tg-detalle' }, `${c?.nombre ?? 'Sin categoría'} · ${formatoFecha(g.fecha, anioActual)}`),
    ),
    h('div', { class: 'tg-monto' }, formatoMonto(g.monto)),
    alMenu && h('button', { class: 'boton-icono', type: 'button', 'aria-label': `Opciones de ${g.nombre}`, onclick: () => alMenu(g) }, icono('menu')),
  );
}

/** Fila de chips de categoría para elegir una. */
export function chipsCategorias(cats: Categoria[], seleccion: number | null, alElegir: (id: number) => void): HTMLElement {
  const cont = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Categoría' });
  const pintar = (sel: number | null) => {
    for (const b of cont.querySelectorAll<HTMLButtonElement>('.chip')) {
      const activo = Number(b.dataset.id) === sel;
      b.classList.toggle('activo', activo);
      b.setAttribute('aria-checked', String(activo));
    }
  };
  for (const c of cats) {
    const b = h('button', { class: 'chip', type: 'button', role: 'radio', 'data-id': c.id }, puntoColor(c.color), c.nombre);
    b.style.setProperty('--chip-color', c.color);
    b.addEventListener('click', () => { pintar(c.id); alElegir(c.id); });
    cont.append(b);
  }
  pintar(seleccion);
  return cont;
}

/** Campo de monto: teclado numérico y separador de miles mientras se escribe. */
export function campoMonto(valor?: number): HTMLInputElement {
  const input = h('input', {
    class: 'campo campo-monto', type: 'text', inputmode: 'numeric', autocomplete: 'off',
    placeholder: '0', 'aria-label': 'Monto', enterkeyhint: 'next', maxlength: 17,
  });
  if (valor) input.value = new Intl.NumberFormat('es-CL').format(valor);
  input.addEventListener('input', () => {
    const dig = input.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 12);
    input.value = dig ? new Intl.NumberFormat('es-CL').format(Number(dig)) : '';
  });
  return input;
}

export function estadoVacio(titulo: string, texto: string): HTMLElement {
  return h('div', { class: 'vacio' }, h('p', { class: 'vacio-titulo' }, titulo), h('p', { class: 'texto-2' }, texto));
}
