import type { Categoria, DatosApp, FiltroGastos, Gasto } from './types';

/** Única puerta hacia los datos. La interfaz no sabe si detrás hay SQLite o el navegador. */
export interface Repositorio {
  listarGastos(filtro?: FiltroGastos): Promise<Gasto[]>;
  agregarGasto(g: Omit<Gasto, 'id'>): Promise<Gasto>;
  editarGasto(g: Gasto): Promise<void>;
  borrarGasto(id: number): Promise<void>;
  listarCategorias(): Promise<Categoria[]>;
  agregarCategoria(c: Omit<Categoria, 'id'>): Promise<Categoria>;
  editarCategoria(c: Categoria): Promise<void>;
  /** Cuántos gastos usan la categoría (para decidir si se puede borrar). */
  contarGastos(categoriaId: number): Promise<number>;
  /** Borra la categoría. Si tiene gastos, exige `reasignarA` y los mueve ahí antes. */
  borrarCategoria(id: number, reasignarA?: number): Promise<void>;
  obtenerTodo(): Promise<DatosApp>;
  reemplazarTodo(datos: DatosApp): Promise<void>;
}

export const CATEGORIAS_INICIALES: Omit<Categoria, 'id'>[] = [
  { nombre: 'Comida', color: '#E8833A' },
  { nombre: 'Transporte', color: '#3B82C4' },
  { nombre: 'Hogar', color: '#8B6BD1' },
  { nombre: 'Salud', color: '#D9534F' },
  { nombre: 'Ocio', color: '#D9A520' },
  { nombre: 'Servicios', color: '#2BA39B' },
  { nombre: 'Otros', color: '#8A8F98' },
];

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_COLOR = /^#[0-9a-fA-F]{6}$/;

export function fechaValida(f: string): boolean {
  if (!RE_FECHA.test(f)) return false;
  const d = new Date(f + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
}

/** Lanza un Error con mensaje legible si el gasto no es válido. */
export function validarGasto(g: Omit<Gasto, 'id'>): void {
  if (typeof g.nombre !== 'string' || g.nombre.trim() === '') throw new Error('Escribe un nombre para el gasto.');
  if (g.nombre.length > 100) throw new Error('El nombre es muy largo (máximo 100 caracteres).');
  if (!Number.isInteger(g.monto) || g.monto <= 0) throw new Error('El monto debe ser un número entero mayor que 0.');
  if (g.monto > 999_999_999_999) throw new Error('El monto es demasiado grande.');
  if (!Number.isInteger(g.categoriaId)) throw new Error('Elige una categoría.');
  if (!fechaValida(g.fecha)) throw new Error('La fecha no es válida.');
}

export function validarCategoria(c: Omit<Categoria, 'id'>): void {
  if (typeof c.nombre !== 'string' || c.nombre.trim() === '') throw new Error('La categoría necesita un nombre.');
  if (c.nombre.length > 40) throw new Error('El nombre de la categoría es muy largo.');
  if (!RE_COLOR.test(c.color)) throw new Error('Color no válido.');
}

/** Orden de listado: más reciente primero. */
export function ordenarGastos(a: Gasto, b: Gasto): number {
  return a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.id - a.id;
}

export function cumpleFiltro(g: Gasto, f?: FiltroGastos): boolean {
  if (!f) return true;
  if (f.desde && g.fecha < f.desde) return false;
  if (f.hasta && g.fecha > f.hasta) return false;
  if (f.categoriaId !== undefined && g.categoriaId !== f.categoriaId) return false;
  return true;
}

/**
 * Implementación para desarrollar en el navegador del PC, donde no hay SQLite nativo.
 * Guarda todo en localStorage como JSON.
 */
export class RepoNavegador implements Repositorio {
  private clave = 'control-gastos:datos';
  private datos: DatosApp;

  constructor() {
    this.datos = this.cargar();
  }

  private cargar(): DatosApp {
    try {
      const txt = localStorage.getItem(this.clave);
      if (txt) return JSON.parse(txt) as DatosApp;
    } catch {
      /* sin almacenamiento: se parte vacío */
    }
    return { categorias: CATEGORIAS_INICIALES.map((c, i) => ({ id: i + 1, ...c })), gastos: [] };
  }

  private guardar(): void {
    try {
      localStorage.setItem(this.clave, JSON.stringify(this.datos));
    } catch {
      /* modo privado: los datos viven solo en memoria */
    }
  }

  private siguienteId(lista: { id: number }[]): number {
    return lista.reduce((m, x) => Math.max(m, x.id), 0) + 1;
  }

  private exigirCategoria(id: number): void {
    if (!this.datos.categorias.some((c) => c.id === id)) throw new Error('La categoría no existe.');
  }

  async listarGastos(filtro?: FiltroGastos): Promise<Gasto[]> {
    return this.datos.gastos.filter((g) => cumpleFiltro(g, filtro)).map((g) => ({ ...g })).sort(ordenarGastos);
  }

  async agregarGasto(g: Omit<Gasto, 'id'>): Promise<Gasto> {
    validarGasto(g);
    this.exigirCategoria(g.categoriaId);
    const nuevo: Gasto = { ...g, nombre: g.nombre.trim(), id: this.siguienteId(this.datos.gastos) };
    this.datos.gastos.push(nuevo);
    this.guardar();
    return { ...nuevo };
  }

  async editarGasto(g: Gasto): Promise<void> {
    validarGasto(g);
    this.exigirCategoria(g.categoriaId);
    const i = this.datos.gastos.findIndex((x) => x.id === g.id);
    if (i < 0) throw new Error('El gasto ya no existe.');
    this.datos.gastos[i] = { ...g, nombre: g.nombre.trim() };
    this.guardar();
  }

  async borrarGasto(id: number): Promise<void> {
    this.datos.gastos = this.datos.gastos.filter((g) => g.id !== id);
    this.guardar();
  }

  async listarCategorias(): Promise<Categoria[]> {
    return this.datos.categorias.map((c) => ({ ...c }));
  }

  async agregarCategoria(c: Omit<Categoria, 'id'>): Promise<Categoria> {
    validarCategoria(c);
    const nombre = c.nombre.trim();
    if (this.datos.categorias.some((x) => x.nombre.toLowerCase() === nombre.toLowerCase()))
      throw new Error('Ya existe una categoría con ese nombre.');
    const nueva = { ...c, nombre, id: this.siguienteId(this.datos.categorias) };
    this.datos.categorias.push(nueva);
    this.guardar();
    return { ...nueva };
  }

  async editarCategoria(c: Categoria): Promise<void> {
    validarCategoria(c);
    const nombre = c.nombre.trim();
    if (this.datos.categorias.some((x) => x.id !== c.id && x.nombre.toLowerCase() === nombre.toLowerCase()))
      throw new Error('Ya existe una categoría con ese nombre.');
    const i = this.datos.categorias.findIndex((x) => x.id === c.id);
    if (i < 0) throw new Error('La categoría no existe.');
    this.datos.categorias[i] = { ...c, nombre };
    this.guardar();
  }

  async contarGastos(categoriaId: number): Promise<number> {
    return this.datos.gastos.filter((g) => g.categoriaId === categoriaId).length;
  }

  async borrarCategoria(id: number, reasignarA?: number): Promise<void> {
    const usados = await this.contarGastos(id);
    if (usados > 0) {
      if (reasignarA === undefined || reasignarA === id) throw new Error('La categoría tiene gastos: elige a cuál moverlos.');
      this.exigirCategoria(reasignarA);
      for (const g of this.datos.gastos) if (g.categoriaId === id) g.categoriaId = reasignarA;
    }
    this.datos.categorias = this.datos.categorias.filter((c) => c.id !== id);
    this.guardar();
  }

  async obtenerTodo(): Promise<DatosApp> {
    return structuredClone(this.datos);
  }

  async reemplazarTodo(datos: DatosApp): Promise<void> {
    this.datos = structuredClone(datos);
    this.guardar();
  }
}
