// Pantalla de inicio de sesión. Las cuentas se crean en la consola de Firebase, no desde la app.
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { aviso, h } from './comun';

function mensajeAuth(e: unknown): string {
  const codigo = (e as { code?: string })?.code ?? '';
  if (codigo === 'auth/invalid-credential' || codigo === 'auth/wrong-password' || codigo === 'auth/user-not-found')
    return 'Correo o contraseña incorrectos.';
  if (codigo === 'auth/invalid-email') return 'El correo no es válido.';
  if (codigo === 'auth/missing-password') return 'Escribe tu contraseña.';
  if (codigo === 'auth/too-many-requests') return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
  if (codigo === 'auth/network-request-failed') return 'Sin conexión. Para iniciar sesión la primera vez necesitas internet.';
  if (codigo === 'auth/user-disabled') return 'Esta cuenta está desactivada.';
  return 'No se pudo iniciar sesión.';
}

export function pantallaLogin(cont: HTMLElement): void {
  const correo = h('input', { class: 'campo', type: 'email', autocomplete: 'username', inputmode: 'email', placeholder: 'tu@correo.com', 'aria-label': 'Correo', required: true });
  const clave = h('input', { class: 'campo', type: 'password', autocomplete: 'current-password', placeholder: 'Contraseña', 'aria-label': 'Contraseña', required: true });
  const error = h('p', { class: 'error-texto', role: 'alert' });
  const entrar = h('button', { class: 'boton primario', type: 'submit' }, 'Iniciar sesión');

  const form = h('form', { class: 'tarjeta pila', novalidate: true },
    h('label', { class: 'etiqueta' }, 'Correo', correo),
    h('label', { class: 'etiqueta' }, 'Contraseña', clave),
    error,
    entrar,
    h('button', { class: 'boton', type: 'button', onclick: async () => {
      error.textContent = '';
      if (!correo.value.trim()) { error.textContent = 'Escribe tu correo para recuperar la contraseña.'; correo.focus(); return; }
      try {
        await sendPasswordResetEmail(auth, correo.value.trim());
        aviso('Si el correo tiene cuenta, te llegará un enlace para cambiar la contraseña.');
      } catch (e) { error.textContent = mensajeAuth(e); }
    } }, '¿Olvidaste tu contraseña?'),
  );

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.textContent = '';
    entrar.disabled = true;
    entrar.textContent = 'Entrando…';
    try {
      await signInWithEmailAndPassword(auth, correo.value.trim(), clave.value);
      // main.ts detecta la sesión y abre la app.
    } catch (e) {
      error.textContent = mensajeAuth(e);
      entrar.disabled = false;
      entrar.textContent = 'Iniciar sesión';
    }
  });

  cont.replaceChildren(
    h('div', { class: 'pantalla pila-grande login' },
      h('div', { class: 'pila' },
        h('p', { class: 'login-marca' }, 'Control de Gastos'),
        h('p', { class: 'texto-2' }, 'Inicia sesión para ver tus gastos en todos tus equipos.'),
      ),
      form,
    ),
  );
  correo.focus();
}
