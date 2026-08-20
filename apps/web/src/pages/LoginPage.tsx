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
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>{t("app.name")}</h1>
          <LangSwitch />
        </div>
        <p className="muted">{t("login.subtitle")}</p>
        {!configured ? (
          <div className="banner warn">{t("login.missingConfig")}</div>
        ) : null}
        {error ? <div className="banner warn">{error}</div> : null}
        <button
          type="button"
          className="btn btn-primary"
          disabled={!configured || busy}
          onClick={() => void onGoogle()}
        >
          {t("login.google")}
        </button>
        <p className="muted">{t("login.privacy")}</p>
      </div>
    </div>
  );
}
