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
import { isPlatformAdminUid, upsertUserProfile } from "../lib/db";
import i18n from "../i18n";

type AuthCtx = {
  user: User | null;
  loading: boolean;
  configured: boolean;
  platformAdmin: boolean;
  adminCheckError: boolean;
  signInGoogle: () => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [adminCheckError, setAdminCheckError] = useState(false);
  const configured = firebaseConfigured();

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, async (next) => {
      setLoading(true);
      setUser(next);
      if (next) {
        const locale = (i18n.language || "es").startsWith("en") ? "en" : "es";
        try {
          await upsertUserProfile(next.uid, {
            email: next.email ?? "",
            displayName: next.displayName ?? "",
            locale,
          });
        } catch {
          /* profile write is best-effort */
        }
        try {
          setPlatformAdmin(await isPlatformAdminUid(next.uid));
          setAdminCheckError(false);
        } catch {
          setPlatformAdmin(false);
          setAdminCheckError(true);
        }
      } else {
        setPlatformAdmin(false);
        setAdminCheckError(false);
      }
      setLoading(false);
    });
  }, [configured]);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      configured,
      platformAdmin,
      adminCheckError,
      signInGoogle: async () => {
        await signInWithPopup(getFirebaseAuth(), googleProvider);
      },
      logout: async () => {
        await signOut(getFirebaseAuth());
      },
    }),
    [user, loading, configured, platformAdmin, adminCheckError],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
