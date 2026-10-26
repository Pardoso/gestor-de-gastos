// Arranque: inicio de sesión, repositorio en Firestore (con copia local) y navegación.
import './styles.css';
import { Capacitor } from '@capacitor/core';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth } from './firebase';
import { RepoFirestore } from './repo-firestore';
import { fechaLocal } from './format';
import { aviso, cerrarPanelSuperior, hayPanelAbierto, icono, mensajeError, type Contexto } from './ui/comun';
import { pantallaRegistrar } from './ui/registrar';
import { pantallaHistorial } from './ui/historial';
import { pantallaGraficos, salirDeGraficos } from './ui/graficos';
import { abrirAjustes } from './ui/ajustes';
import { pantallaLogin } from './ui/login';
import { ofrecerMigracion } from './ui/migrar';

type Vista = 'registrar' | 'historial' | 'graficos';
const TITULOS: Record<Vista, string> = { registrar: 'Registrar', historial: 'Historial', graficos: 'Gráficos' };
const ICONOS_NAV = { registrar: 'agregar', historial: 'lista', graficos: 'grafico' } as const;

const contenedor = document.getElementById('vista')!;
const titulo = document.getElementById('titulo')!;
const estadoSync = document.getElementById('estado-sync')!;
const nav = document.querySelectorAll<HTMLAnchorElement>('.barra a');

let ctx: Contexto | null = null;
let repo: RepoFirestore | null = null;
let pendienteSync = false;
let refrescoPendiente = false;

function vistaActual(): Vista {
  const v = location.hash.slice(1);
  return v === 'historial' || v === 'graficos' ? v : 'registrar';
}

let dibujando: Promise<void> = Promise.resolve();
function dibujar(): Promise<void> {
  dibujando = dibujando.then(async () => {
    if (!ctx) return;
    refrescoPendiente = false;
    const v = vistaActual();
    titulo.textContent = TITULOS[v];
    nav.forEach((a) => a.toggleAttribute('aria-current', a.dataset.vista === v));
    if (v !== 'graficos') salirDeGraficos();
    try {
      if (v === 'registrar') await pantallaRegistrar(ctx, contenedor, () => ctx && abrirAjustes(ctx));
      else if (v === 'historial') await pantallaHistorial(ctx, contenedor);
      else await pantallaGraficos(ctx, contenedor);
    } catch (e) {
      aviso(mensajeError(e), true);
    }
  });
  return dibujando;
}

/** No redibujar si el usuario está escribiendo o tiene un panel abierto. */
function puedeRefrescar(): boolean {
  if (hayPanelAbierto()) return false;
  const activo = document.activeElement;
  return !(activo instanceof HTMLInputElement && activo.value !== '' && contenedor.contains(activo));
}

function pintarEstado(): void {
  const sinRed = !navigator.onLine;
  estadoSync.hidden = !ctx || (!sinRed && !pendienteSync);
  estadoSync.textContent = sinRed ? 'Sin conexión' : 'Sincronizando…';
  estadoSync.title = sinRed ? 'Los cambios se guardan en este equipo y se subirán al reconectar.' : 'Subiendo cambios a tu cuenta.';
}

async function entrar(usuario: User): Promise<void> {
  document.body.classList.remove('sin-sesion');
  titulo.textContent = 'Cargando…';
  contenedor.replaceChildren();
  repo = new RepoFirestore(usuario.uid);
  repo.alError = (m) => aviso(m, true);
  repo.alEstado = (e) => { pendienteSync = e.pendiente; pintarEstado(); };
  repo.alCambiarRemoto = () => { if (puedeRefrescar()) dibujar(); else refrescoPendiente = true; };
  try {
    await repo.iniciar();
  } catch (e) {
    contenedor.textContent = 'No se pudieron leer tus datos: ' + mensajeError(e);
    return;
  }
  ctx = {
    repo,
    hoy: () => fechaLocal(),
    cambio: dibujar,
    cuenta: {
      correo: usuario.email ?? '',
      cerrarSesion: async () => { await signOut(auth); },
    },
  };
  pintarEstado();
  await dibujar();
  await ofrecerMigracion(ctx);
}

function salir(): void {
  repo?.detener();
  repo = null;
  ctx = null;
  salirDeGraficos();
  while (hayPanelAbierto()) cerrarPanelSuperior();
  document.body.classList.add('sin-sesion');
  titulo.textContent = 'Iniciar sesión';
  pintarEstado();
  pantallaLogin(contenedor);
}

function iniciar(): void {
  document.getElementById('btn-ajustes')!.append(icono('ajustes'));
  nav.forEach((a) => a.prepend(icono(ICONOS_NAV[a.dataset.vista as Vista])));

  window.addEventListener('hashchange', () => { dibujar(); window.scrollTo(0, 0); });
  document.getElementById('btn-ajustes')!.addEventListener('click', () => { if (ctx) abrirAjustes(ctx); });
  window.addEventListener('online', pintarEstado);
  window.addEventListener('offline', pintarEstado);
  // Si llegaron cambios de otro equipo mientras se escribía, mostrarlos al terminar.
  document.addEventListener('focusout', () => setTimeout(() => { if (refrescoPendiente && puedeRefrescar()) dibujar(); }, 300));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (vistaActual() === 'graficos') dibujar(); });

  if (Capacitor.isNativePlatform()) {
    import('@capacitor/app').then(({ App }) => {
      App.addListener('backButton', () => {
        if (hayPanelAbierto()) cerrarPanelSuperior();
        else if (ctx && vistaActual() !== 'registrar') location.hash = '#registrar';
        else App.exitApp();
      });
      App.addListener('resume', () => { if (ctx && puedeRefrescar()) dibujar(); }); // "hoy" pudo cambiar
    });
  } else {
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && hayPanelAbierto()) cerrarPanelSuperior(); });
  }

  onAuthStateChanged(auth, (usuario) => {
    if (usuario) entrar(usuario);
    else salir();
  });
}

iniciar();
