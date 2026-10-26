# Control de Gastos (Android)

App para registrar gastos en segundos y verlos en gráficos. Hecha según el documento
*Arquitectura App de Control de Gastos (Android)*, con un cambio: los gastos se sincronizan entre
equipos con **Firebase Firestore**. Funciona sin internet y sube los cambios al reconectarse.

Versión web: https://pardoso.github.io/gestor-de-gastos/

## Firebase

- Proyecto: `gestor-de-gastossp` (configuración en `src/firebase.ts`, no es secreta).
- Inicio de sesión con correo y contraseña. Las cuentas se crean en la consola de Firebase
  (Authentication → Usuarios), no desde la app.
- Datos en `usuarios/{uid}/categorias` y `usuarios/{uid}/gastos`. Reglas de Firestore:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /usuarios/{uid}/{documento=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

## Probar en el PC

```bash
npm install        # solo la primera vez
npm run dev        # abre http://localhost:5173
```

En PowerShell usa `npm.cmd` en vez de `npm`, o haz doble clic en `iniciar.bat`.
Al subir cambios a `main`, GitHub Actions publica la versión web sola.

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
| `src/main.ts` | Arranque: sesión, repositorio y navegación |
| `src/types.ts` | Tipos: Gasto, Categoria, ResumenKpi |
| `src/repo.ts` | Interfaz `Repositorio`, validaciones y una versión local (usada en las pruebas) |
| `src/firebase.ts` | Conexión a Firebase con copia local para funcionar sin internet |
| `src/repo-firestore.ts` | `Repositorio` sobre Firestore, con cambios en tiempo real |
| `src/stats.ts` | Cálculos puros: por mes, semana ISO, categoría, KPIs |
| `src/format.ts` | Formato `$1.234.567` y fechas es-CL |
| `src/backup.ts` | Exportar JSON/CSV por el menú Compartir; importar, reemplazando o combinando |
| `src/ui/` | Pantallas Registrar, Historial, Gráficos y el panel de Ajustes |
| `tests/` | Pruebas de `stats.ts` y del respaldo |

## Notas

- El APK necesita el permiso de internet para sincronizar con Firebase.
- El respaldo JSON sigue disponible como copia extra (la app avisa a los 30 días sin respaldo).
- El respaldo incluye un número de versión. Si cambian las tablas, la migración se agrega en `migrar()` de `backup.ts`.
