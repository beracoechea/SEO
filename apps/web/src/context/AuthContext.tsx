import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { firebaseConfigured, getFirebaseAuth, googleProvider } from "../lib/firebase";
import { upsertUserProfile } from "../lib/db";
import i18n from "../i18n";

type AuthCtx = {
  user: User | null;
  loading: boolean;
  configured: boolean;
  signInGoogle: () => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = firebaseConfigured();

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, async (next) => {
      setUser(next);
      if (next) {
        const locale = (i18n.language || "es").startsWith("en") ? "en" : "es";
        try {
          await upsertUserProfile(next.uid, {
            email: next.email ?? "",
            displayName: next.displayName ?? "",
            photoUrl: next.photoURL,
            locale,
          });
        } catch {
          /* profile write is best-effort */
        }
      }
      setLoading(false);
    });
  }, [configured]);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      configured,
      signInGoogle: async () => {
        await signInWithPopup(getFirebaseAuth(), googleProvider);
      },
      logout: async () => {
        await signOut(getFirebaseAuth());
      },
    }),
    [user, loading, configured],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
