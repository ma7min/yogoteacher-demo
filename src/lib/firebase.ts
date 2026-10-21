import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore, initializeFirestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getMessaging, Messaging } from 'firebase/messaging';
import firebaseConfig from '../../firebase-applet-config.json';

export const isFirebaseMock = !firebaseConfig.apiKey || firebaseConfig.apiKey === 'dummy-api-key';

let app;
let db: Firestore | null = null;
let auth: Auth | null = null;
let storage: FirebaseStorage | null = null;
let messaging: Messaging | null = null;
export let firebaseInitError: string | null = null;

if (!isFirebaseMock) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    const dbId = firebaseConfig.firestoreDatabaseId;
    if (dbId && dbId !== '(default)' && dbId !== '') {
      console.log('Firebase: Initializing Firestore with custom database ID:', dbId);
      db = initializeFirestore(app, { experimentalForceLongPolling: true }, dbId);
    } else {
      console.log('Firebase: Initializing Firestore with default database instance');
      db = initializeFirestore(app, { experimentalForceLongPolling: true });
    }
    auth = getAuth(app);
    storage = getStorage(app);
    
    // Initialize Messaging (only in browser environment)
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      messaging = getMessaging(app);
    }
  } catch (error: any) {
    console.error('Firebase initialization error, falling back to mock:', error);
    firebaseInitError = error.message || String(error);
  }
}

export { db, auth, storage, messaging };

// --- 3. Create error handlers (Conforming to Rules) ---
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

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const currentAuth = auth;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentAuth?.currentUser?.uid || null,
      email: currentAuth?.currentUser?.email || null,
      emailVerified: currentAuth?.currentUser?.emailVerified || null,
      isAnonymous: currentAuth?.currentUser?.isAnonymous || null,
      tenantId: currentAuth?.currentUser?.tenantId || null,
      providerInfo: currentAuth?.currentUser?.providerData?.map(provider => ({
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
