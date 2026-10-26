import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection, type capSQLiteSet } from '@capacitor-community/sqlite';
import type { Categoria, DatosApp, FiltroGastos, Gasto } from './types';
import { CATEGORIAS_INICIALES, validarCategoria, validarGasto, type Repositorio } from './repo';

const NOMBRE_DB = 'control_gastos';

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS categorias (
  id     INTEGER PRIMARY KEY,
  nombre TEXT UNIQUE NOT NULL,
  color  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS gastos (
  id           INTEGER PRIMARY KEY,
  nombre       TEXT    NOT NULL,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id),
  monto        INTEGER NOT NULL CHECK (monto > 0),
  fecha        TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);
`;

interface FilaGasto {
  id: number;
  nombre: string;
  categoria_id: number;
  monto: number;
  fecha: string;
}

const aGasto = (f: FilaGasto): Gasto => ({
  id: f.id,
  nombre: f.nombre,
  categoriaId: f.categoria_id,
  monto: f.monto,
  fecha: f.fecha,
});

/** Abre (o crea) la base SQLite en el teléfono y devuelve el repositorio. */
export async function crearRepoSqlite(): Promise<Repositorio> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const consistente = (await sqlite.checkConnectionsConsistency()).result;
  const existe = (await sqlite.isConnection(NOMBRE_DB, false)).result;
  const db =
    consistente && existe
      ? await sqlite.retrieveConnection(NOMBRE_DB, false)
      : await sqlite.createConnection(NOMBRE_DB, false, 'no-encryption', 1, false);
  await db.open();
  await db.execute('PRAGMA foreign_keys = ON;', false);
  await db.execute(ESQUEMA);

  const repo = new RepoSqlite(db);
  if ((await repo.listarCategorias()).length === 0) {
    await db.executeSet(
      CATEGORIAS_INICIALES.map((c) => ({ statement: 'INSERT INTO categorias (nombre, color) VALUES (?, ?)', values: [c.nombre, c.color] })),
    );
  }
  return repo;
}

class RepoSqlite implements Repositorio {
  constructor(private db: SQLiteDBConnection) {}

  async listarGastos(filtro?: FiltroGastos): Promise<Gasto[]> {
    const where: string[] = [];
    const valores: (string | number)[] = [];
    if (filtro?.desde) { where.push('fecha >= ?'); valores.push(filtro.desde); }
    if (filtro?.hasta) { where.push('fecha <= ?'); valores.push(filtro.hasta); }
    if (filtro?.categoriaId !== undefined) { where.push('categoria_id = ?'); valores.push(filtro.categoriaId); }
    const sql =
      'SELECT id, nombre, categoria_id, monto, fecha FROM gastos' +
      (where.length ? ' WHERE ' + where.join(' AND ') : '') +
      ' ORDER BY fecha DESC, id DESC';
    const res = await this.db.query(sql, valores);
    return ((res.values ?? []) as FilaGasto[]).map(aGasto);
  }

  async agregarGasto(g: Omit<Gasto, 'id'>): Promise<Gasto> {
    validarGasto(g);
    const nombre = g.nombre.trim();
    const res = await this.db.run(
      'INSERT INTO gastos (nombre, categoria_id, monto, fecha) VALUES (?, ?, ?, ?)',
      [nombre, g.categoriaId, g.monto, g.fecha],
    );
    const id = res.changes?.lastId;
    if (!id) throw new Error('No se pudo guardar el gasto.');
    return { ...g, nombre, id };
  }

  async editarGasto(g: Gasto): Promise<void> {
    validarGasto(g);
    await this.db.run('UPDATE gastos SET nombre = ?, categoria_id = ?, monto = ?, fecha = ? WHERE id = ?', [
      g.nombre.trim(), g.categoriaId, g.monto, g.fecha, g.id,
    ]);
  }

  async borrarGasto(id: number): Promise<void> {
    await this.db.run('DELETE FROM gastos WHERE id = ?', [id]);
  }

  async listarCategorias(): Promise<Categoria[]> {
    const res = await this.db.query('SELECT id, nombre, color FROM categorias ORDER BY id');
    return (res.values ?? []) as Categoria[];
  }

  private async nombreRepetido(nombre: string, excluirId = -1): Promise<boolean> {
    const res = await this.db.query('SELECT id FROM categorias WHERE lower(nombre) = lower(?) AND id <> ?', [nombre, excluirId]);
    return (res.values ?? []).length > 0;
  }

  async agregarCategoria(c: Omit<Categoria, 'id'>): Promise<Categoria> {
    validarCategoria(c);
    const nombre = c.nombre.trim();
    if (await this.nombreRepetido(nombre)) throw new Error('Ya existe una categoría con ese nombre.');
    const res = await this.db.run('INSERT INTO categorias (nombre, color) VALUES (?, ?)', [nombre, c.color]);
    const id = res.changes?.lastId;
    if (!id) throw new Error('No se pudo guardar la categoría.');
    return { id, nombre, color: c.color };
  }

  async editarCategoria(c: Categoria): Promise<void> {
    validarCategoria(c);
    const nombre = c.nombre.trim();
    if (await this.nombreRepetido(nombre, c.id)) throw new Error('Ya existe una categoría con ese nombre.');
    await this.db.run('UPDATE categorias SET nombre = ?, color = ? WHERE id = ?', [nombre, c.color, c.id]);
  }

  async contarGastos(categoriaId: number): Promise<number> {
    const res = await this.db.query('SELECT COUNT(*) AS n FROM gastos WHERE categoria_id = ?', [categoriaId]);
    return Number(res.values?.[0]?.n ?? 0);
  }

  async borrarCategoria(id: number, reasignarA?: number): Promise<void> {
    const set: capSQLiteSet[] = [];
    if ((await this.contarGastos(id)) > 0) {
      if (reasignarA === undefined || reasignarA === id) throw new Error('La categoría tiene gastos: elige a cuál moverlos.');
      set.push({ statement: 'UPDATE gastos SET categoria_id = ? WHERE categoria_id = ?', values: [reasignarA, id] });
    }
    set.push({ statement: 'DELETE FROM categorias WHERE id = ?', values: [id] });
    await this.db.executeSet(set); // en una sola transacción
  }

  async obtenerTodo(): Promise<DatosApp> {
    return { categorias: await this.listarCategorias(), gastos: await this.listarGastos() };
  }

  async reemplazarTodo(datos: DatosApp): Promise<void> {
    datos.categorias.forEach(validarCategoria);
    datos.gastos.forEach(validarGasto);
    const set: capSQLiteSet[] = [
      { statement: 'DELETE FROM gastos', values: [] },
      { statement: 'DELETE FROM categorias', values: [] },
      ...datos.categorias.map((c) => ({
        statement: 'INSERT INTO categorias (id, nombre, color) VALUES (?, ?, ?)',
        values: [c.id, c.nombre.trim(), c.color],
      })),
      ...datos.gastos.map((g) => ({
        statement: 'INSERT INTO gastos (id, nombre, categoria_id, monto, fecha) VALUES (?, ?, ?, ?, ?)',
        values: [g.id, g.nombre.trim(), g.categoriaId, g.monto, g.fecha],
      })),
    ];
    await this.db.executeSet(set); // todo o nada
  }
}
