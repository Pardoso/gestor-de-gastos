import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cl.usuario.controlgastos',
  appName: 'Control de Gastos',
  webDir: 'dist',
  android: {
    // No se cargan recursos externos: todo viene dentro del APK.
    allowMixedContent: false,
  },
};

export default config;
