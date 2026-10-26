// Arranque: elige el repositorio (SQLite en el teléfono, navegador en el PC) y maneja la navegación.
import './styles.css';
import { Capacitor } from '@capacitor/core';
import { RepoNavegador, type Repositorio } from './repo';
import { fechaLocal } from './format';
import { aviso, cerrarPanelSuperior, hayPanelAbierto, icono, mensajeError, type Contexto } from './ui/comun';
import { pantallaRegistrar } from './ui/registrar';
import { pantallaHistorial } from './ui/historial';
import { pantallaGraficos, salirDeGraficos } from './ui/graficos';
import { abrirAjustes } from './ui/ajustes';

type Vista = 'registrar' | 'historial' | 'graficos';
const TITULOS: Record<Vista, string> = { registrar: 'Registrar', historial: 'Historial', graficos: 'Gráficos' };
const ICONOS_NAV = { registrar: 'agregar', historial: 'lista', graficos: 'grafico' } as const;

async function elegirRepositorio(): Promise<Repositorio> {
  if (Capacitor.isNativePlatform()) {
    const { crearRepoSqlite } = await import('./db');
    return crearRepoSqlite();
  }
  return new RepoNavegador();
}

function vistaActual(): Vista {
  const v = location.hash.slice(1);
  return v === 'historial' || v === 'graficos' ? v : 'registrar';
}

async function iniciar(): Promise<void> {
  const contenedor = document.getElementById('vista')!;
  const titulo = document.getElementById('titulo')!;
  const nav = document.querySelectorAll<HTMLAnchorElement>('.barra a');
  document.getElementById('btn-ajustes')!.append(icono('ajustes'));
  nav.forEach((a) => a.prepend(icono(ICONOS_NAV[a.dataset.vista as Vista])));

  let repo: Repositorio;
  try {
    repo = await elegirRepositorio();
  } catch (e) {
    contenedor.textContent = 'No se pudo abrir la base de datos: ' + mensajeError(e);
    return;
  }

  let dibujando: Promise<void> = Promise.resolve();
  const dibujar = (): Promise<void> => {
    dibujando = dibujando.then(async () => {
      const v = vistaActual();
      titulo.textContent = TITULOS[v];
      nav.forEach((a) => a.toggleAttribute('aria-current', a.dataset.vista === v));
      if (v !== 'graficos') salirDeGraficos();
      try {
        if (v === 'registrar') await pantallaRegistrar(ctx, contenedor, () => abrirAjustes(ctx));
        else if (v === 'historial') await pantallaHistorial(ctx, contenedor);
        else await pantallaGraficos(ctx, contenedor);
      } catch (e) {
        aviso(mensajeError(e), true);
      }
    });
    return dibujando;
  };

  const ctx: Contexto = { repo, hoy: () => fechaLocal(), cambio: dibujar };

  window.addEventListener('hashchange', () => { dibujar(); window.scrollTo(0, 0); });
  document.getElementById('btn-ajustes')!.addEventListener('click', () => abrirAjustes(ctx));
  // Volver a dibujar los gráficos si cambia el modo oscuro.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (vistaActual() === 'graficos') dibujar(); });

  if (Capacitor.isNativePlatform()) {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', () => {
      if (hayPanelAbierto()) cerrarPanelSuperior();
      else if (vistaActual() !== 'registrar') location.hash = '#registrar';
      else App.exitApp();
    });
    // Al volver a la app otro día, "hoy" cambia: refrescar.
    App.addListener('resume', () => { if (!hayPanelAbierto()) dibujar(); });
  } else {
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && hayPanelAbierto()) cerrarPanelSuperior(); });
  }

  await dibujar();
}

iniciar();
