import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User,
  signOut
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  collection, 
  getDocs, 
  getDocFromServer,
  query,
  orderBy
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { AppSettings, ChatSession, MemoryBank } from '../types';

// Initialize Firebase Core
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Google Auth Provider with Google Drive Scopes
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.addScope('https://www.googleapis.com/auth/drive');

// In-Memory Secret/Token Caching (Security Constraint: Never store in localStorage)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

// 1. Connection Validation as requested by strict system instructions
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firebase client appears to be offline. Operating in cache mode.");
    }
  }
}
testConnection();

// 2. Strict Custom Firestore Error Handler conforme with metadata requirements
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
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
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

// 3. Authenticated Authentication Lifecycle Listeners
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else {
        // Fallback or request login if offline
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleAuthProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve access token from Google Auth Provider');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

// --- Synchronized Storage Proxies (Pivoted from SQL to Firestore) ---

// A. AppSettings Synchronization
export const syncLoadSettings = async (fallback: AppSettings): Promise<AppSettings> => {
  const user = auth.currentUser;
  if (!user) return fallback;
  
  const path = `users/${user.uid}/config/settings`;
  try {
    const docRef = doc(db, 'users', user.uid, 'config', 'settings');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as AppSettings;
    }
    return fallback;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return fallback;
  }
};

export const syncSaveSettings = async (settings: AppSettings): Promise<void> => {
  const user = auth.currentUser;
  if (!user) return;
  
  const path = `users/${user.uid}/config/settings`;
  try {
    const docRef = doc(db, 'users', user.uid, 'config', 'settings');
    await setDoc(docRef, settings);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

// B. MemoryBank Synchronization
export const syncLoadMemory = async (fallback: MemoryBank): Promise<MemoryBank> => {
  const user = auth.currentUser;
  if (!user) return fallback;
  
  const path = `users/${user.uid}/config/memory`;
  try {
    const docRef = doc(db, 'users', user.uid, 'config', 'memory');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as MemoryBank;
    }
    return fallback;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return fallback;
  }
};

export const syncSaveMemory = async (memory: MemoryBank): Promise<void> => {
  const user = auth.currentUser;
  if (!user) return;
  
  const path = `users/${user.uid}/config/memory`;
  try {
    const docRef = doc(db, 'users', user.uid, 'config', 'memory');
    await setDoc(docRef, memory);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

// C. ChatSession History Synchronization
export const syncLoadSessions = async (): Promise<ChatSession[]> => {
  const user = auth.currentUser;
  if (!user) return [];
  
  const path = `users/${user.uid}/sessions`;
  try {
    const collRef = collection(db, 'users', user.uid, 'sessions');
    const q = query(collRef, orderBy('lastModified', 'desc'));
    const querySnap = await getDocs(q);
    const sessionsList: ChatSession[] = [];
    querySnap.forEach((d) => {
      sessionsList.push(d.data() as ChatSession);
    });
    return sessionsList;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const syncSaveSession = async (session: ChatSession): Promise<void> => {
  const user = auth.currentUser;
  if (!user) return;
  
  const path = `users/${user.uid}/sessions/${session.id}`;
  try {
    const docRef = doc(db, 'users', user.uid, 'sessions', session.id);
    await setDoc(docRef, session);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const syncDeleteSession = async (id: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user) return;
  
  const path = `users/${user.uid}/sessions/${id}`;
  try {
    const docRef = doc(db, 'users', user.uid, 'sessions', id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};
