import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { saveLocale } from "../lib/db";
import { useAuth } from "../context/AuthContext";

export function LangSwitch() {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const current = i18n.language.startsWith("en") ? "en" : "es";

  function setLang(lng: "es" | "en") {
    void i18n.changeLanguage(lng);
    localStorage.setItem("locale", lng);
    if (user) void saveLocale(user.uid, lng);
  }

  return (
    <div className="lang-switch" role="group" aria-label={t("lang.es")}>
      <Globe size={16} aria-hidden />
      <button type="button" className="lang-chip" aria-label={t("lang.es")} aria-pressed={current === "es"} onClick={() => setLang("es")}>
        ES
      </button>
      <button type="button" className="lang-chip" aria-label={t("lang.en")} aria-pressed={current === "en"} onClick={() => setLang("en")}>
        EN
      </button>
    </div>
  );
}
