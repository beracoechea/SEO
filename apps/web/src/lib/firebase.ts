import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { initializeFirestore, type Firestore } from "firebase/firestore";

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

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

export function getFirebaseAuth(): Auth {
  if (!firebaseConfigured()) {
    throw new Error("missing-firebase-config");
  }
  if (!app) {
    app = initializeApp(config);
    auth = getAuth(app);
    db = initializeFirestore(
      app,
      {
        ignoreUndefinedProperties: true,
        experimentalForceLongPolling: true,
      },
      FIRESTORE_DATABASE_ID,
    );
  }
  return auth!;
}

export function getDb(): Firestore {
  getFirebaseAuth();
  return db!;
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
