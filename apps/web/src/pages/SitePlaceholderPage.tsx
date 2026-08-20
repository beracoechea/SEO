import { useTranslation } from "react-i18next";

export function SitePlaceholderPage() {
  const { t } = useTranslation();
  return (
    <div className="page stack">
      <h1>{t("nav.sites")}</h1>
      <p className="muted">{t("help.historyLivesOnRuntime")}</p>
      <p className="muted">{t("runtime.unreachable")}</p>
    </div>
  );
}
