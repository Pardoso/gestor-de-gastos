// Conexión a Firebase. Estos datos identifican el proyecto pero no son secretos:
// lo que protege los gastos son las reglas de Firestore (cada usuario solo ve los suyos).
import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCklxJ50Snt3iTk6nSfuwD-qHl_YBF1MSc',
  authDomain: 'gestor-de-gastossp.firebaseapp.com',
  projectId: 'gestor-de-gastossp',
  storageBucket: 'gestor-de-gastossp.firebasestorage.app',
  messagingSenderId: '591983104448',
  appId: '1:591983104448:web:6e5709264009a8daeb3825',
};

export const app = initializeApp(firebaseConfig);

// La sesión queda guardada en el equipo: no hay que iniciar sesión cada vez.
// Sin "popupRedirectResolver" para que funcione igual dentro del APK.
export const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });

// Copia local de los datos: la app funciona sin internet y sincroniza al reconectarse.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
