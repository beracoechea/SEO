import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
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
    db = getFirestore(app);
  }
  return auth!;
}

export function getDb(): Firestore {
  getFirebaseAuth();
  return db!;
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
