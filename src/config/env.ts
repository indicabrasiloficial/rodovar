// Configuração centralizada de variáveis de ambiente para o Rodovar Monitora
import firebaseConfig from '../../firebase-applet-config.json';

export const ENV = {
  // Provedor de banco ativo
  DATABASE_PROVIDER: import.meta.env.VITE_DATABASE_PROVIDER || 'Firebase Realtime Database',

  // Configurações do Firebase Client
  FIREBASE: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey || '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId || '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket || '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfig.appId || '',
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || firebaseConfig.measurementId || '',
    databaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || firebaseConfig.firestoreDatabaseId || '(default)',
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || (firebaseConfig as any).databaseURL || `https://${import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId || 'default'}-default-rtdb.firebaseio.com`
  },

  // Servidor e outras integrações
  SERVER_URL: import.meta.env.VITE_SERVER_URL || import.meta.env.APP_URL || '',
};
