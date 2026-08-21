import { Building2, LogOut, Users } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IconBtn } from "../components/IconBtn";
import { LangSwitch } from "../components/LangSwitch";
import { useAuth } from "../context/AuthContext";

export function AdminShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const initial = (user?.displayName || user?.email || "?").slice(0, 1).toUpperCase();

  return (
    <div className="app-shell">
      <header className="app-bar">
        <div className="avatar">{initial}</div>
        <strong className="app-bar-title">{t("admin.badge")}</strong>
        <LangSwitch />
        <IconBtn label={t("admin.backToOrgs")} tone="sky" onClick={() => navigate("/orgs")} icon={<Building2 size={20} />} />
        <IconBtn label={t("nav.logout")} tone="danger" onClick={() => void logout()} icon={<LogOut size={20} />} />
      </header>
      <div className="app-body">
        <Outlet />
      </div>
      <nav className="tab-bar">
        <NavLink to="/admin" end className={({ isActive }) => (isActive ? "tab active" : "tab")}>
          <Building2 size={22} />
          <span>{t("admin.navOrgs")}</span>
        </NavLink>
        <NavLink to="/admin/users" className={({ isActive }) => (isActive ? "tab active" : "tab")}>
          <Users size={22} />
          <span>{t("admin.navUsers")}</span>
        </NavLink>
      </nav>
    </div>
  );
}
