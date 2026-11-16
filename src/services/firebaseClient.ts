import {Capacitor} from '@capacitor/core';
import {initializeApp} from 'firebase/app';
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import {doc, getDocFromServer, getFirestore} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({prompt: 'select_account'});

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

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

testConnection();

export async function signInWithGoogleSmart(): Promise<User | null> {
  if (Capacitor.isNativePlatform()) {
    throw new Error(
      'گوگل اجازه ورود OAuth را داخل WebView اپلیکیشن نمی‌دهد. برای همگام‌سازی ابری، سایت roozhaye-manozari-7.ai.studio را در مرورگر کروم باز کنید یا از دکمه‌های پشتیبان JSON استفاده نمایید.'
    );
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err) {
    const code = (err as {code?: string})?.code ?? '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return null;
    }
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    if (code === 'auth/unauthorized-domain') {
      const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      throw new Error(
        `دامنه «${host}» در Firebase Authorized Domains مجاز نشده است. در کنسول Firebase (بخش Authentication > Settings) دامنه‌های roozhaye-manozari-7.ai.studio و localhost را اضافه کنید یا همگام‌سازی گوگل را در نسخه وب انجام دهید.`
      );
    }
    throw err;
  }
}

export async function checkRedirectSignIn(): Promise<User | null> {
  if (Capacitor.isNativePlatform()) {
    return null;
  }
  try {
    const res = await getRedirectResult(auth);
    return res?.user ?? null;
  } catch (err) {
    console.warn('Redirect sign-in notice:', err);
    return null;
  }
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

export {onAuthStateChanged};
export type {User};
