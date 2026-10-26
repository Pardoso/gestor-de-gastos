// Repositorio en Firestore: usuarios/{uid}/categorias y usuarios/{uid}/gastos.
// Los datos se mantienen en memoria con escuchas en tiempo real; las escrituras se
// aplican al tiro en el equipo y Firestore las sube cuando hay conexión.
import {
  collection, deleteDoc, doc, onSnapshot, setDoc, writeBatch,
  type CollectionReference, type DocumentData, type QuerySnapshot, type Unsubscribe, type WriteBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { CATEGORIAS_INICIALES, cumpleFiltro, ordenarGastos, validarCategoria, validarGasto, type Repositorio } from './repo';
import type { Categoria, DatosApp, FiltroGastos, Gasto } from './types';

const MAX_OPERACIONES_LOTE = 400; // Firestore admite hasta 500 por lote

export interface EstadoSync {
  pendiente: boolean; // hay cambios locales aún no subidos
}

export class RepoFirestore implements Repositorio {
  private cats = new Map<number, Categoria>();
  private gastos = new Map<number, Gasto>();
  private escuchas: Unsubscribe[] = [];
  private sembrado = false;
  private pendientes = { categorias: false, gastos: false };

  /** Se llama cuando llegan cambios desde otro equipo. */
  alCambiarRemoto?: () => void;
  /** Se llama si una escritura falla (por ejemplo, permisos). */
  alError?: (mensaje: string) => void;
  /** Se llama cuando cambia si hay datos por subir. */
  alEstado?: (e: EstadoSync) => void;

  constructor(private uid: string) {}

  private col(nombre: 'categorias' | 'gastos'): CollectionReference<DocumentData> {
    return collection(db, 'usuarios', this.uid, nombre);
  }

  /** Empieza a escuchar los datos. Resuelve cuando ya hay una primera copia (local o del servidor). */
  iniciar(): Promise<void> {
    let listos = 0;
    return new Promise((resolver, rechazar) => {
      const primera = () => { if (++listos === 2) resolver(); };
      const fallo = (e: Error) => { rechazar(e); this.alError?.(traducirError(e)); };

      let inicioCats = true;
      this.escuchas.push(onSnapshot(this.col('categorias'), { includeMetadataChanges: true }, (snap) => {
        this.cats = leerCategorias(snap);
        this.avisarEstado('categorias', snap.metadata.hasPendingWrites);
        // Categorías iniciales solo si el servidor confirma que la cuenta está vacía.
        if (snap.empty && !snap.metadata.fromCache && !this.sembrado) this.sembrarCategorias();
        if (inicioCats) { inicioCats = false; primera(); }
        else if (!snap.metadata.hasPendingWrites && snap.docChanges().length > 0) this.alCambiarRemoto?.();
      }, fallo));

      let inicioGastos = true;
      this.escuchas.push(onSnapshot(this.col('gastos'), { includeMetadataChanges: true }, (snap) => {
        this.gastos = leerGastos(snap);
        this.avisarEstado('gastos', snap.metadata.hasPendingWrites);
        if (inicioGastos) { inicioGastos = false; primera(); }
        else if (!snap.metadata.hasPendingWrites && snap.docChanges().length > 0) this.alCambiarRemoto?.();
      }, fallo));
    });
  }

  detener(): void {
    this.escuchas.forEach((u) => u());
    this.escuchas = [];
  }

  private avisarEstado(cual: 'categorias' | 'gastos', pendiente: boolean): void {
    const antes = this.pendientes.categorias || this.pendientes.gastos;
    this.pendientes[cual] = pendiente;
    const ahora = this.pendientes.categorias || this.pendientes.gastos;
    if (antes !== ahora) this.alEstado?.({ pendiente: ahora });
  }

  private sembrarCategorias(): void {
    this.sembrado = true;
    const lote = writeBatch(db);
    CATEGORIAS_INICIALES.forEach((c, i) => {
      const cat = { id: i + 1, ...c };
      this.cats.set(cat.id, cat);
      lote.set(doc(this.col('categorias'), String(cat.id)), { nombre: cat.nombre, color: cat.color });
    });
    this.enviar(lote.commit());
  }

  /** No se espera la confirmación del servidor: sin internet quedaría esperando. */
  private enviar(p: Promise<unknown>): void {
    p.catch((e) => this.alError?.(traducirError(e)));
  }

  private nuevoId(usados: Map<number, unknown>): number {
    let id: number;
    do id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    while (usados.has(id));
    return id;
  }

  private exigirCategoria(id: number): void {
    if (!this.cats.has(id)) throw new Error('La categoría no existe.');
  }

  private nombreRepetido(nombre: string, excluirId = -1): boolean {
    const n = nombre.toLowerCase();
    return [...this.cats.values()].some((c) => c.id !== excluirId && c.nombre.toLowerCase() === n);
  }

  // ---------- Repositorio ----------

  async listarGastos(filtro?: FiltroGastos): Promise<Gasto[]> {
    return [...this.gastos.values()].filter((g) => cumpleFiltro(g, filtro)).map((g) => ({ ...g })).sort(ordenarGastos);
  }

  async agregarGasto(g: Omit<Gasto, 'id'>): Promise<Gasto> {
    validarGasto(g);
    this.exigirCategoria(g.categoriaId);
    const nuevo: Gasto = { ...g, nombre: g.nombre.trim(), id: this.nuevoId(this.gastos) };
    this.gastos.set(nuevo.id, nuevo);
    this.enviar(setDoc(doc(this.col('gastos'), String(nuevo.id)), datosGasto(nuevo)));
    return { ...nuevo };
  }

  async editarGasto(g: Gasto): Promise<void> {
    validarGasto(g);
    this.exigirCategoria(g.categoriaId);
    if (!this.gastos.has(g.id)) throw new Error('El gasto ya no existe.');
    const editado = { ...g, nombre: g.nombre.trim() };
    this.gastos.set(g.id, editado);
    this.enviar(setDoc(doc(this.col('gastos'), String(g.id)), datosGasto(editado)));
  }

  async borrarGasto(id: number): Promise<void> {
    this.gastos.delete(id);
    this.enviar(deleteDoc(doc(this.col('gastos'), String(id))));
  }

  async listarCategorias(): Promise<Categoria[]> {
    return [...this.cats.values()].sort((a, b) => a.id - b.id).map((c) => ({ ...c }));
  }

  async agregarCategoria(c: Omit<Categoria, 'id'>): Promise<Categoria> {
    validarCategoria(c);
    const nombre = c.nombre.trim();
    if (this.nombreRepetido(nombre)) throw new Error('Ya existe una categoría con ese nombre.');
    const nueva = { id: this.nuevoId(this.cats), nombre, color: c.color };
    this.cats.set(nueva.id, nueva);
    this.enviar(setDoc(doc(this.col('categorias'), String(nueva.id)), { nombre, color: c.color }));
    return { ...nueva };
  }

  async editarCategoria(c: Categoria): Promise<void> {
    validarCategoria(c);
    const nombre = c.nombre.trim();
    if (this.nombreRepetido(nombre, c.id)) throw new Error('Ya existe una categoría con ese nombre.');
    this.exigirCategoria(c.id);
    this.cats.set(c.id, { id: c.id, nombre, color: c.color });
    this.enviar(setDoc(doc(this.col('categorias'), String(c.id)), { nombre, color: c.color }));
  }

  async contarGastos(categoriaId: number): Promise<number> {
    let n = 0;
    for (const g of this.gastos.values()) if (g.categoriaId === categoriaId) n++;
    return n;
  }

  async borrarCategoria(id: number, reasignarA?: number): Promise<void> {
    const afectados = [...this.gastos.values()].filter((g) => g.categoriaId === id);
    if (afectados.length > 0) {
      if (reasignarA === undefined || reasignarA === id) throw new Error('La categoría tiene gastos: elige a cuál moverlos.');
      this.exigirCategoria(reasignarA);
    }
    const lotes = new Lotes();
    for (const g of afectados) {
      const movido = { ...g, categoriaId: reasignarA! };
      this.gastos.set(g.id, movido);
      lotes.siguiente().set(doc(this.col('gastos'), String(g.id)), datosGasto(movido));
    }
    this.cats.delete(id);
    lotes.siguiente().delete(doc(this.col('categorias'), String(id)));
    lotes.enviar((p) => this.enviar(p));
  }

  async obtenerTodo(): Promise<DatosApp> {
    return { categorias: await this.listarCategorias(), gastos: await this.listarGastos() };
  }

  async reemplazarTodo(datos: DatosApp): Promise<void> {
    datos.categorias.forEach(validarCategoria);
    datos.gastos.forEach(validarGasto);
    const lotes = new Lotes();
    const nuevasCats = new Set(datos.categorias.map((c) => c.id));
    const nuevosGastos = new Set(datos.gastos.map((g) => g.id));
    for (const id of this.gastos.keys()) if (!nuevosGastos.has(id)) lotes.siguiente().delete(doc(this.col('gastos'), String(id)));
    for (const id of this.cats.keys()) if (!nuevasCats.has(id)) lotes.siguiente().delete(doc(this.col('categorias'), String(id)));
    for (const c of datos.categorias) lotes.siguiente().set(doc(this.col('categorias'), String(c.id)), { nombre: c.nombre.trim(), color: c.color });
    for (const g of datos.gastos) lotes.siguiente().set(doc(this.col('gastos'), String(g.id)), datosGasto(g));
    this.cats = new Map(datos.categorias.map((c) => [c.id, { ...c, nombre: c.nombre.trim() }]));
    this.gastos = new Map(datos.gastos.map((g) => [g.id, { ...g, nombre: g.nombre.trim() }]));
    lotes.enviar((p) => this.enviar(p));
  }
}

/** Reparte muchas operaciones en varios lotes de Firestore. */
class Lotes {
  private lotes: WriteBatch[] = [];
  private enActual = MAX_OPERACIONES_LOTE;

  siguiente(): WriteBatch {
    if (this.enActual >= MAX_OPERACIONES_LOTE) { this.lotes.push(writeBatch(db)); this.enActual = 0; }
    this.enActual++;
    return this.lotes[this.lotes.length - 1];
  }

  enviar(fn: (p: Promise<void>) => void): void {
    this.lotes.forEach((l) => fn(l.commit()));
  }
}

const datosGasto = (g: Gasto) => ({ nombre: g.nombre.trim(), categoriaId: g.categoriaId, monto: g.monto, fecha: g.fecha });

function leerCategorias(snap: QuerySnapshot<DocumentData>): Map<number, Categoria> {
  const m = new Map<number, Categoria>();
  for (const d of snap.docs) {
    const id = Number(d.id);
    const { nombre, color } = d.data();
    if (Number.isSafeInteger(id) && typeof nombre === 'string' && typeof color === 'string') m.set(id, { id, nombre, color });
  }
  return m;
}

function leerGastos(snap: QuerySnapshot<DocumentData>): Map<number, Gasto> {
  const m = new Map<number, Gasto>();
  for (const d of snap.docs) {
    const id = Number(d.id);
    const { nombre, categoriaId, monto, fecha } = d.data();
    if (Number.isSafeInteger(id) && typeof nombre === 'string' && Number.isInteger(categoriaId) && Number.isInteger(monto) && typeof fecha === 'string')
      m.set(id, { id, nombre, categoriaId, monto, fecha });
  }
  return m;
}

export function traducirError(e: unknown): string {
  const codigo = (e as { code?: string })?.code ?? '';
  if (codigo.includes('permission-denied')) return 'Firestore rechazó el cambio: revisa las reglas de seguridad.';
  if (codigo.includes('unavailable')) return 'Sin conexión con el servidor. Los cambios se guardan en el equipo.';
  if (codigo.includes('resource-exhausted')) return 'Se alcanzó el límite gratuito de Firebase por hoy.';
  return e instanceof Error ? e.message : 'Error al sincronizar.';
}
