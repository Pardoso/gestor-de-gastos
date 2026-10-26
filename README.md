# Control de Gastos (Android)

App para registrar gastos en segundos y verlos en gráficos. Funciona entera dentro del teléfono:
sin servidor, sin cuenta y sin internet. Hecha según el documento *Arquitectura App de Control de Gastos (Android)*.

## Probar en el PC

```bash
npm install        # solo la primera vez
npm run dev        # abre http://localhost:5173
```

En el navegador los datos se guardan en el propio navegador (no en SQLite).
En **Ajustes → Cargar datos de ejemplo** hay 6 meses de gastos de prueba (solo aparece en modo desarrollo).

```bash
npm test           # pruebas de cálculos y respaldo (Vitest)
```

## Generar el APK

Requiere **Android Studio** (trae el SDK de Android y el JDK).

1. `npm run build`: compila la web en `dist/`
2. `npx cap sync android`: copia `dist/` al proyecto `android/`
3. `npx cap open android`: abre Android Studio
4. En Android Studio: **Build → Build App Bundle(s) / APK(s) → Build APK(s)**

El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`. Pásalo al teléfono por USB o Drive y ábrelo.
Android pedirá permitir la instalación desde orígenes desconocidos la primera vez.

Atajo para los pasos 1 a 3: `npm run android`.

## Estructura

| Archivo | Qué hace |
|---|---|
| `src/main.ts` | Arranque: elige el repositorio (SQLite en el teléfono, navegador en el PC) y la navegación |
| `src/types.ts` | Tipos: Gasto, Categoria, ResumenKpi |
| `src/repo.ts` | Interfaz `Repositorio`, validaciones y la versión para navegador |
| `src/db.ts` | `Repositorio` con SQLite (consultas con parámetros) |
| `src/stats.ts` | Cálculos puros: por mes, semana ISO, categoría, KPIs |
| `src/format.ts` | Formato `$1.234.567` y fechas es-CL |
| `src/backup.ts` | Exportar JSON/CSV por el menú Compartir; importar, reemplazando o combinando |
| `src/ui/` | Pantallas Registrar, Historial, Gráficos y el panel de Ajustes |
| `tests/` | Pruebas de `stats.ts` y del respaldo |

## Notas

- El manifiesto de Android **no tiene permiso de internet**: la app no puede enviar datos fuera del teléfono.
- Los datos viven solo en el teléfono. **Exporta el respaldo JSON** de vez en cuando (la app avisa a los 30 días).
- El respaldo incluye un número de versión. Si cambian las tablas, la migración se agrega en `migrar()` de `backup.ts`.
