import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FirebaseError } from "firebase/app";
import { LangSwitch } from "../components/LangSwitch";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const { t } = useTranslation();
  const { signInGoogle, configured } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onGoogle() {
    setError(null);
    setBusy(true);
    try {
      await signInGoogle();
    } catch (e) {
      if (e instanceof FirebaseError && e.code === "auth/popup-closed-by-user") {
        setError(t("login.popupClosed"));
      } else {
        setError(t("login.denied"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-hero">
      <div className="card login-box stack">
        <div className="login-mark" aria-hidden>
          W
        </div>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24 }}>{t("app.name")}</h1>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              {t("login.subtitle")}
            </p>
          </div>
          <LangSwitch />
        </div>
        {!configured ? <div className="banner warn">{t("login.missingConfig")}</div> : null}
        {error ? <div className="banner warn">{error}</div> : null}
        <button type="button" className="btn btn-google" disabled={!configured || busy} onClick={() => void onGoogle()}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
            <path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.2-1.5 3.6-5.1 3.6-3.1 0-5.6-2.5-5.6-5.6S8.9 6.2 12 6.2c1.8 0 3 .7 3.7 1.4l2.5-2.4C16.7 3.7 14.6 2.8 12 2.8 6.9 2.8 2.8 6.9 2.8 12S6.9 21.2 12 21.2c5.4 0 8.9-3.8 8.9-9.1 0-.6 0-1-.1-1.5H12z" />
          </svg>
          {t("login.google")}
        </button>
        <p className="muted">{t("login.privacy")}</p>
      </div>
    </div>
  );
}
