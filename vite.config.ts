import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Rutas relativas para que el APK encuentre los archivos.
  base: './',
  build: { outDir: 'dist', target: 'es2020' },
  server: { host: true, port: 5173 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
