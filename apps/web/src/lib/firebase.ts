import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

function readEnv(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Named Firestore DB in the shared Blaze project. Never the other app's `(default)`. */
export const FIRESTORE_DATABASE_ID = readEnv(import.meta.env.VITE_FIRESTORE_DATABASE) || "webs";

const config = {
  apiKey: readEnv(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: readEnv(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: readEnv(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: readEnv(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: readEnv(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: readEnv(import.meta.env.VITE_FIREBASE_APP_ID),
};

export function firebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.projectId && config.appId);
}

export function isFirestoreNetworkError(e: unknown): boolean {
  const code = typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : "";
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return (
    code.includes("unavailable") ||
    code.includes("deadline") ||
    /NAME_NOT_RESOLVED|NETWORK_CHANGED|Failed to fetch|network/i.test(msg)
  );
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

function openFirestore(instance: FirebaseApp): Firestore {
  const settings: {
    ignoreUndefinedProperties: boolean;
    experimentalForceLongPolling: boolean;
    experimentalAutoDetectLongPolling: boolean;
    localCache?: ReturnType<typeof persistentLocalCache>;
  } = {
    ignoreUndefinedProperties: true,
    experimentalForceLongPolling: true,
    experimentalAutoDetectLongPolling: false,
  };
  if (typeof indexedDB !== "undefined") {
    settings.localCache = persistentLocalCache({ tabManager: persistentMultipleTabManager() });
  }
  return initializeFirestore(instance, settings, FIRESTORE_DATABASE_ID);
}

export function getFirebaseAuth(): Auth {
  if (!firebaseConfigured()) {
    throw new Error("missing-firebase-config");
  }
  if (!app) {
    app = initializeApp(config);
    auth = getAuth(app);
    db = openFirestore(app);
  }
  return auth!;
}

export function getDb(): Firestore {
  getFirebaseAuth();
  return db!;
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
