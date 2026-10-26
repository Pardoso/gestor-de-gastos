// Si este navegador tiene gastos de la versión sin cuenta, ofrece subirlos a la cuenta.
import { aJson, importar, validarRespaldo } from '../backup';
import { confirmar, aviso, mensajeError, type Contexto } from './comun';

const CLAVE_DATOS = 'control-gastos:datos';
const CLAVE_MIGRADO = 'control-gastos:migrado';

export async function ofrecerMigracion(ctx: Contexto): Promise<void> {
  let texto: string | null = null;
  try {
    if (localStorage.getItem(CLAVE_MIGRADO)) return;
    texto = localStorage.getItem(CLAVE_DATOS);
  } catch {
    return;
  }
  if (!texto) return;

  let datos;
  try {
    const antiguo = JSON.parse(texto);
    datos = validarRespaldo(aJson({ categorias: antiguo.categorias ?? [], gastos: antiguo.gastos ?? [] }));
  } catch {
    return; // datos dañados: no se ofrece nada
  }
  const marcar = () => { try { localStorage.setItem(CLAVE_MIGRADO, new Date().toISOString()); } catch { /* sin almacenamiento */ } };
  if (datos.gastos.length === 0) { marcar(); return; }

  const n = datos.gastos.length;
  const si = await confirmar(
    'Gastos en este equipo',
    `Este navegador tiene ${n} ${n === 1 ? 'gasto guardado' : 'gastos guardados'} de antes de iniciar sesión. ¿Los subo a tu cuenta? No se duplican los que ya estén.`,
    'Subir a mi cuenta',
  );
  marcar(); // no volver a preguntar
  if (!si) return;
  try {
    const agregados = await importar(ctx.repo, datos, 'combinar');
    aviso(`Se subieron ${agregados} gastos a tu cuenta`);
    await ctx.cambio();
  } catch (e) {
    aviso(mensajeError(e), true);
  }
}
