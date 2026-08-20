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
    <div className="lang-switch">
      <button
        type="button"
        className="btn"
        aria-pressed={current === "es"}
        onClick={() => setLang("es")}
      >
        {t("lang.es")}
      </button>
      <button
        type="button"
        className="btn"
        aria-pressed={current === "en"}
        onClick={() => setLang("en")}
      >
        {t("lang.en")}
      </button>
    </div>
  );
}
