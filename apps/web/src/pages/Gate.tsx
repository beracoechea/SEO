import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { LoginPage } from "./LoginPage";

export function Gate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="page">
        <p className="muted">{t("common.loading")}</p>
      </div>
    );
  }
  if (!user) return <LoginPage />;
  return <>{children}</>;
}

export function RootRedirect() {
  return <Navigate to="/orgs" replace />;
}
