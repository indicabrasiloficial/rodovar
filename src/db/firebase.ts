import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, enableIndexedDbPersistence } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { ENV } from '../config/env';

const config = ENV.FIREBASE;

const app = initializeApp(config);
export const db = getFirestore(app, config.databaseId); /* CRITICAL: The app will break without this line */
export const database = getDatabase(app, config.databaseURL);


// Enable offline IndexedDB persistence for robust local fallback when network is unavailable
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Rodovar Monitora: Persistência falhou (múltiplas abas abertas).');
    } else if (err.code === 'unimplemented') {
      console.warn('Rodovar Monitora: O navegador atual não suporta persistência local.');
    } else {
      console.warn('Rodovar Monitora: Erro ao habilitar cache offline:', err);
    }
  });
}

export const auth = getAuth();

// Auto authenticate anonymously if not logged in
auth.onAuthStateChanged((user) => {
  if (!user) {
    // Unauthenticated mode allows fully open read/write operations on our deployed rules.
    // Bypassing signInAnonymously to prevent console errors if it's disabled in owner's console.
  }
});

export const signInWithGoogle = () => {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
};

export const logout = () => signOut(auth);

// Validate Connection to Firestore on boot with clean, non-crashing reporting
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Rodovar Monitora: Conexão estritamente online com Firestore estabelecida com sucesso.");
  } catch (error: any) {
    const msg = error instanceof Error ? error.message : String(error);
    const code = error?.code || 'unknown';
    console.info(`Rodovar Monitora: Firestore operando no modo híbrido/offline cache sob demanda. (Causa: ${code} - ${msg})`);
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
