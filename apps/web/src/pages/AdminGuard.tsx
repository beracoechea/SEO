import { Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AdminUidHint } from "../components/AdminUidHint";
import { IconBtn } from "../components/IconBtn";
import { useAuth } from "../context/AuthContext";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { platformAdmin, loading, user, adminCheckError } = useAuth();
  if (loading) {
    return (
      <div className="page stack" style={{ alignItems: "center", paddingTop: 80 }}>
        <div className="spinner" aria-hidden="true" />
        <p className="muted">{t("common.loading")}</p>
      </div>
    );
  }
  if (!platformAdmin) {
    return (
      <div className="page stack">
        <h1>{t("admin.notAdmin")}</h1>
        {adminCheckError ? <div className="banner danger">{t("admin.rulesDenied")}</div> : null}
        {user ? <AdminUidHint uid={user.uid} /> : null}
        <IconBtn to="/orgs" label={t("admin.backToOrgs")} tone="sky" showLabel icon={<Building2 size={18} />} />
      </div>
    );
  }
  return <>{children}</>;
}
