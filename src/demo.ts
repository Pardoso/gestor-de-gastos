// Datos de ejemplo de 6 meses para probar en el navegador. Solo se usa en desarrollo.
import { sumarDias } from './stats';
import type { Categoria, DatosApp, Gasto } from './types';

const EJEMPLOS: Record<string, [string, number, number][]> = {
  // nombre, monto mínimo, monto máximo
  Comida: [['Supermercado', 15000, 90000], ['Almuerzo', 5000, 14000], ['Feria', 6000, 25000], ['Café', 2000, 4500], ['Panadería', 1500, 5000]],
  Transporte: [['Bencina', 20000, 50000], ['Metro', 800, 1500], ['Uber', 3500, 12000], ['Estacionamiento', 1500, 5000]],
  Hogar: [['Artículos de aseo', 5000, 20000], ['Ferretería', 4000, 35000]],
  Salud: [['Farmacia', 3000, 30000], ['Consulta médica', 25000, 45000]],
  Ocio: [['Cine', 6000, 15000], ['Restaurante', 18000, 60000], ['Streaming', 6500, 9900]],
  Servicios: [['Luz', 25000, 45000], ['Agua', 12000, 22000], ['Internet', 22000, 28000], ['Celular', 12000, 18000]],
  Otros: [['Regalo', 10000, 40000], ['Peluquería', 8000, 15000]],
};

export function datosDemo(hoy: string, categorias: Categoria[]): DatosApp {
  let semilla = 42;
  const azar = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647;
  const gastos: Gasto[] = [];
  let id = 1;
  for (let d = 0; d < 183; d++) {
    const fecha = sumarDias(hoy, -d);
    const n = Math.floor(azar() * 3.2);
    for (let i = 0; i < n; i++) {
      const cat = categorias[Math.floor(azar() * categorias.length)];
      const lista = EJEMPLOS[cat.nombre] ?? EJEMPLOS.Otros;
      const [nombre, min, max] = lista[Math.floor(azar() * lista.length)];
      const monto = Math.round((min + azar() * (max - min)) / 100) * 100;
      gastos.push({ id: id++, nombre, categoriaId: cat.id, monto, fecha });
    }
  }
  return { categorias, gastos };
}
