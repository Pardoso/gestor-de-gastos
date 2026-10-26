// Exportar e importar respaldo. Usa repo.ts para los datos y entrega el archivo
// al menú Compartir de Android (o lo descarga, en el navegador del PC).
import type { Repositorio } from './repo';
import { fechaValida } from './repo';
import type { Categoria, DatosApp, Gasto } from './types';

export const VERSION_RESPALDO = 1;

export interface ArchivoRespaldo extends DatosApp {
  app: 'control-gastos';
  version: number;
  exportado: string;
}

export function aJson(datos: DatosApp, ahora = new Date()): string {
  const archivo: ArchivoRespaldo = { app: 'control-gastos', version: VERSION_RESPALDO, exportado: ahora.toISOString(), ...datos };
  return JSON.stringify(archivo, null, 2);
}

const celda = (v: string | number): string => {
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV para Excel en español: separador ';' y BOM para que respete los acentos. */
export function aCsv(datos: DatosApp): string {
  const nombre = new Map(datos.categorias.map((c) => [c.id, c.nombre]));
  const filas = [...datos.gastos]
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id - b.id))
    .map((g) => [g.fecha, g.nombre, nombre.get(g.categoriaId) ?? 'Sin categoría', g.monto].map(celda).join(';'));
  return '﻿' + ['Fecha;Nombre;Categoría;Monto', ...filas].join('\r\n') + '\r\n';
}

/** Migra respaldos de versiones antiguas al formato actual. */
function migrar(obj: Record<string, unknown>): Record<string, unknown> {
  // Versión 1 es la actual. Al cambiar las tablas, agregar aquí cada paso: if (v === 1) { ...; v = 2 }
  return obj;
}

/** Valida un respaldo antes de tocar la base de datos. Lanza Error con un mensaje legible. */
export function validarRespaldo(texto: string): DatosApp {
  let obj: unknown;
  try {
    obj = JSON.parse(texto.replace(/^﻿/, ''));
  } catch {
    throw new Error('El archivo no es un respaldo JSON válido.');
  }
  if (typeof obj !== 'object' || obj === null || (obj as { app?: unknown }).app !== 'control-gastos')
    throw new Error('El archivo no es un respaldo de Control de Gastos.');
  const version = (obj as { version?: unknown }).version;
  if (typeof version !== 'number' || version < 1) throw new Error('El respaldo no indica su versión.');
  if (version > VERSION_RESPALDO) throw new Error('El respaldo es de una versión más nueva de la app. Actualiza la app.');
  const datos = migrar(obj as Record<string, unknown>);

  const categorias = datos.categorias;
  const gastos = datos.gastos;
  if (!Array.isArray(categorias) || !Array.isArray(gastos)) throw new Error('Al respaldo le faltan categorías o gastos.');

  const cats: Categoria[] = categorias.map((c, i) => {
    if (!Number.isInteger(c?.id) || typeof c?.nombre !== 'string' || !c.nombre.trim() || typeof c?.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(c.color))
      throw new Error(`Categoría ${i + 1} del respaldo no es válida.`);
    return { id: c.id, nombre: c.nombre.trim(), color: c.color };
  });
  const ids = new Set(cats.map((c) => c.id));
  if (ids.size !== cats.length) throw new Error('El respaldo tiene categorías repetidas.');
  if (new Set(cats.map((c) => c.nombre.toLowerCase())).size !== cats.length) throw new Error('El respaldo tiene nombres de categoría repetidos.');

  const vistos = new Set<number>();
  const gs: Gasto[] = gastos.map((g, i) => {
    const ok =
      Number.isInteger(g?.id) && !vistos.has(g.id) &&
      typeof g?.nombre === 'string' && g.nombre.trim() !== '' &&
      Number.isInteger(g?.monto) && g.monto > 0 &&
      Number.isInteger(g?.categoriaId) && ids.has(g.categoriaId) &&
      typeof g?.fecha === 'string' && fechaValida(g.fecha);
    if (!ok) throw new Error(`Gasto ${i + 1} del respaldo no es válido.`);
    vistos.add(g.id);
    return { id: g.id, nombre: g.nombre.trim(), categoriaId: g.categoriaId, monto: g.monto, fecha: g.fecha };
  });
  return { categorias: cats, gastos: gs };
}

export type ModoImportar = 'reemplazar' | 'combinar';

/** Importa un respaldo ya validado. Devuelve cuántos gastos se agregaron. */
export async function importar(repo: Repositorio, datos: DatosApp, modo: ModoImportar): Promise<number> {
  if (modo === 'reemplazar') {
    await repo.reemplazarTodo(datos);
    return datos.gastos.length;
  }
  // Combinar: las categorías se unen por nombre y se omiten los gastos idénticos.
  const actuales = await repo.listarCategorias();
  const mapa = new Map<number, number>();
  for (const c of datos.categorias) {
    const igual = actuales.find((x) => x.nombre.toLowerCase() === c.nombre.toLowerCase());
    mapa.set(c.id, igual ? igual.id : (await repo.agregarCategoria({ nombre: c.nombre, color: c.color })).id);
  }
  const clave = (g: Omit<Gasto, 'id'>) => `${g.fecha}|${g.nombre.toLowerCase()}|${g.monto}|${g.categoriaId}`;
  const existentes = new Set((await repo.listarGastos()).map(clave));
  let agregados = 0;
  for (const g of datos.gastos) {
    const nuevo = { nombre: g.nombre, monto: g.monto, fecha: g.fecha, categoriaId: mapa.get(g.categoriaId)! };
    if (existentes.has(clave(nuevo))) continue;
    await repo.agregarGasto(nuevo);
    existentes.add(clave(nuevo));
    agregados++;
  }
  return agregados;
}

export type TipoExportar = 'json' | 'csv';

/** Genera el archivo y lo entrega al usuario. */
export async function exportar(repo: Repositorio, tipo: TipoExportar, hoy: string): Promise<void> {
  const datos = await repo.obtenerTodo();
  const contenido = tipo === 'json' ? aJson(datos) : aCsv(datos);
  const nombre = `gastos-${hoy}.${tipo}`;
  const mime = tipo === 'json' ? 'application/json' : 'text/csv';
  await entregarArchivo(nombre, contenido, mime);
}

async function entregarArchivo(nombre: string, contenido: string, mime: string): Promise<void> {
  const { Capacitor } = await import('@capacitor/core');
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const { uri } = await Filesystem.writeFile({ path: nombre, data: contenido, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: 'Respaldo de gastos', files: [uri], dialogTitle: 'Guardar o enviar respaldo' });
    return;
  }
  const url = URL.createObjectURL(new Blob([contenido], { type: mime + ';charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
