import { describe, expect, it } from 'vitest';
import {
  categoriaPorMes, diasEntre, mesesEntre, porCategoria, porMes, porSemana, rangoPeriodo, resumen, semanaIso,
} from '../src/stats';
import { formatoMonto, formatoVariacion, leerMonto } from '../src/format';
import type { Categoria, Gasto } from '../src/types';

const cats: Categoria[] = [
  { id: 1, nombre: 'Comida', color: '#E8833A' },
  { id: 2, nombre: 'Transporte', color: '#3B82C4' },
  { id: 3, nombre: 'Ocio', color: '#D9A520' },
];

let n = 0;
const g = (fecha: string, monto: number, categoriaId = 1): Gasto => ({ id: ++n, nombre: 'x', categoriaId, monto, fecha });

describe('semanaIso', () => {
  it('un domingo y el lunes siguiente caen en semanas distintas', () => {
    expect(semanaIso('2026-10-25')).toBe('2026-S43'); // domingo
    expect(semanaIso('2026-10-26')).toBe('2026-S44'); // lunes
  });

  it('31 de diciembre y 1 de enero pueden ser la misma semana ISO de años distintos', () => {
    expect(semanaIso('2026-12-31')).toBe('2026-S53');
    expect(semanaIso('2027-01-01')).toBe('2026-S53');
    expect(semanaIso('2024-12-31')).toBe('2025-S01');
    expect(semanaIso('2025-01-01')).toBe('2025-S01');
  });
});

describe('lista vacía', () => {
  it('devuelve ceros sin error ni división por cero', () => {
    const r = resumen([], '2026-10-01', '2026-10-31');
    expect(r.total).toBe(0);
    expect(r.promedioDiario).toBe(0);
    expect(r.gastoMayor).toBeNull();
    expect(r.variacion).toBeNull();
    expect(porMes([])).toEqual({ etiquetas: [], valores: [] });
    expect(porSemana([])).toEqual({ etiquetas: [], valores: [] });
    expect(porCategoria([], cats).porcentajes).toEqual([]);
    expect(porMes([], '2026-09-01', '2026-10-31').valores).toEqual([0, 0]);
  });
});

describe('porCategoria', () => {
  it('los porcentajes suman 100 %', () => {
    const r = porCategoria([g('2026-10-01', 333), g('2026-10-02', 333, 2), g('2026-10-03', 334, 3), g('2026-10-04', 1, 1)], cats);
    expect(r.porcentajes.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 9);
    expect(r.etiquetas[0]).toBe('Comida'); // ordenado de mayor a menor
    expect(r.colores[0]).toBe('#E8833A');
  });
});

describe('resumen', () => {
  it('variación con total anterior 0 devuelve "sin datos"', () => {
    const r = resumen([g('2026-10-05', 1000)], '2026-10-01', '2026-10-31');
    expect(r.variacion).toBeNull();
    expect(formatoVariacion(r.variacion)).toBe('sin datos');
  });

  it('compara contra el periodo anterior de igual largo', () => {
    // periodo: 1 al 10 de oct (10 días); anterior: 21 al 30 de sep
    const gastos = [g('2026-10-02', 3000), g('2026-10-10', 1500), g('2026-09-21', 2000), g('2026-09-30', 1000), g('2026-09-20', 99999)];
    const r = resumen(gastos, '2026-10-01', '2026-10-10');
    expect(r.total).toBe(4500);
    expect(r.dias).toBe(10);
    expect(r.promedioDiario).toBe(450);
    expect(r.totalAnterior).toBe(3000);
    expect(r.variacion).toBeCloseTo(0.5);
    expect(r.gastoMayor?.monto).toBe(3000);
  });
});

describe('series', () => {
  it('porMes rellena meses sin gastos', () => {
    const r = porMes([g('2026-08-15', 100), g('2026-10-01', 50), g('2026-10-31', 25)]);
    expect(r).toEqual({ etiquetas: ['2026-08', '2026-09', '2026-10'], valores: [100, 0, 75] });
  });

  it('porSemana entrega las últimas 12 semanas', () => {
    const r = porSemana([g('2026-10-26', 10), g('2026-10-25', 5)], '2026-10-26');
    expect(r.etiquetas).toHaveLength(12);
    expect(r.etiquetas.at(-1)).toBe('2026-S44');
    expect(r.valores.at(-1)).toBe(10);
    expect(r.valores.at(-2)).toBe(5);
  });

  it('categoriaPorMes arma la matriz mes × categoría', () => {
    const m = categoriaPorMes([g('2026-09-01', 10, 2), g('2026-10-01', 20, 1), g('2026-10-02', 5, 2)], cats);
    expect(m.meses).toEqual(['2026-09', '2026-10']);
    expect(m.series).toEqual([
      { categoria: 'Comida', color: '#E8833A', valores: [0, 20] },
      { categoria: 'Transporte', color: '#3B82C4', valores: [10, 5] },
    ]);
  });
});

describe('fechas y formato', () => {
  it('diasEntre cuenta ambos extremos', () => {
    expect(diasEntre('2026-10-26', '2026-10-26')).toBe(1);
    expect(diasEntre('2026-02-01', '2026-02-28')).toBe(28);
  });

  it('mesesEntre cruza años', () => {
    expect(mesesEntre('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('rangoPeriodo', () => {
    expect(rangoPeriodo('mes', '2026-10-26')).toEqual({ desde: '2026-10-01', hasta: '2026-10-26' });
    expect(rangoPeriodo('3m', '2026-01-15')).toEqual({ desde: '2025-11-01', hasta: '2026-01-15' });
    expect(rangoPeriodo('anio', '2026-10-26')).toEqual({ desde: '2026-01-01', hasta: '2026-10-26' });
    expect(rangoPeriodo('todo', '2026-10-26', '2025-03-04')).toEqual({ desde: '2025-03-04', hasta: '2026-10-26' });
  });

  it('montos en formato chileno', () => {
    expect(formatoMonto(1234567)).toBe('$1.234.567');
    expect(leerMonto('$1.234.567')).toBe(1234567);
    expect(leerMonto('')).toBeNaN();
  });
});
