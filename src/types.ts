export interface Categoria {
  id: number;
  nombre: string;
  color: string; // color fijo por categoría en los gráficos
}

export interface Gasto {
  id: number;
  nombre: string;
  categoriaId: number;
  monto: number; // entero, en pesos
  fecha: string; // 'AAAA-MM-DD'
}

export interface FiltroGastos {
  desde?: string;
  hasta?: string;
  categoriaId?: number;
}

/** Datos listos para un gráfico simple de Chart.js. */
export interface Serie {
  etiquetas: string[];
  valores: number[];
}

export interface SerieCategorias extends Serie {
  colores: string[];
  porcentajes: number[];
}

export interface MatrizCategoriaMes {
  meses: string[];
  series: { categoria: string; color: string; valores: number[] }[];
}

export interface ResumenKpi {
  total: number;
  dias: number;
  promedioDiario: number;
  gastoMayor: Gasto | null;
  totalAnterior: number;
  /** Fracción (0.25 = +25 %). null cuando el periodo anterior es 0: "sin datos". */
  variacion: number | null;
}

/** Contenido completo de un respaldo. */
export interface DatosApp {
  categorias: Categoria[];
  gastos: Gasto[];
}
