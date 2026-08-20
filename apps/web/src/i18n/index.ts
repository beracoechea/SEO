import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import es from "./es.json";

const stored =
  typeof localStorage !== "undefined" ? localStorage.getItem("locale") : null;
const browser = typeof navigator !== "undefined" ? navigator.language : "es";
const fallback = stored === "en" || stored === "es" ? stored : browser.startsWith("es") ? "es" : "en";

void i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng: fallback,
  fallbackLng: "es",
  interpolation: { escapeValue: false },
});

export default i18n;
