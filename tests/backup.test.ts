import { beforeEach, describe, expect, it } from 'vitest';
import { aCsv, aJson, importar, validarRespaldo } from '../src/backup';
import { RepoNavegador } from '../src/repo';
import type { DatosApp } from '../src/types';

// localStorage mínimo para usar RepoNavegador en Node.
beforeEach(() => {
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
});

const datos: DatosApp = {
  categorias: [{ id: 1, nombre: 'Comida', color: '#E8833A' }, { id: 9, nombre: 'Mascotas', color: '#4CAF50' }],
  gastos: [
    { id: 1, nombre: 'Pan; "integral"', categoriaId: 1, monto: 2500, fecha: '2026-10-01' },
    { id: 2, nombre: 'Veterinario', categoriaId: 9, monto: 30000, fecha: '2026-10-02' },
  ],
};

describe('respaldo', () => {
  it('exportar y reimportar deja los mismos datos', async () => {
    const repo = new RepoNavegador();
    await repo.reemplazarTodo(datos);
    const texto = aJson(await repo.obtenerTodo());
    await repo.reemplazarTodo({ categorias: [], gastos: [] });
    await importar(repo, validarRespaldo(texto), 'reemplazar');
    const despues = await repo.obtenerTodo();
    expect(despues.categorias).toEqual(datos.categorias);
    expect([...despues.gastos].sort((a, b) => a.id - b.id)).toEqual(datos.gastos);
  });

  it('combinar une categorías por nombre y no duplica gastos', async () => {
    const repo = new RepoNavegador(); // trae las 7 categorías iniciales
    const n1 = await importar(repo, validarRespaldo(aJson(datos)), 'combinar');
    const n2 = await importar(repo, validarRespaldo(aJson(datos)), 'combinar');
    expect(n1).toBe(2);
    expect(n2).toBe(0);
    const cats = await repo.listarCategorias();
    expect(cats.filter((c) => c.nombre === 'Comida')).toHaveLength(1);
    expect(cats.some((c) => c.nombre === 'Mascotas')).toBe(true);
  });

  it('rechaza archivos inválidos antes de tocar la base', () => {
    expect(() => validarRespaldo('hola')).toThrow(/JSON/);
    expect(() => validarRespaldo('{"app":"otra"}')).toThrow(/Control de Gastos/);
    expect(() => validarRespaldo(JSON.stringify({ app: 'control-gastos', version: 99, categorias: [], gastos: [] }))).toThrow(/más nueva/);
    const malo = JSON.parse(aJson(datos));
    malo.gastos[0].monto = -5;
    expect(() => validarRespaldo(JSON.stringify(malo))).toThrow(/Gasto 1/);
    malo.gastos[0].monto = 5;
    malo.gastos[0].categoriaId = 77;
    expect(() => validarRespaldo(JSON.stringify(malo))).toThrow(/Gasto 1/);
  });

  it('CSV para Excel con ; y comillas escapadas', () => {
    const csv = aCsv(datos);
    expect(csv.startsWith('﻿Fecha;Nombre;Categoría;Monto\r\n')).toBe(true);
    expect(csv).toContain('2026-10-01;"Pan; ""integral""";Comida;2500');
    expect(csv).toContain('2026-10-02;Veterinario;Mascotas;30000');
  });
});
