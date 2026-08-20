import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { LangSwitch } from "../components/LangSwitch";
import { useAuth } from "../context/AuthContext";
import { getOrg, listMyOrgs, pingRuntime } from "../lib/db";

export function Shell() {
  const { t } = useTranslation();
  const { orgId } = useParams();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [runtimeUp, setRuntimeUp] = useState<boolean | null>(null);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!orgId) return;
    void getOrg(orgId).then((o) => {
      if (o?.runtimeBaseUrl) {
        void pingRuntime(o.runtimeBaseUrl).then(setRuntimeUp);
      } else {
        setRuntimeUp(false);
      }
    });
  }, [orgId]);

  useEffect(() => {
    if (!user) return;
    void listMyOrgs(user.uid).then((list) => setOrgs(list.map((o) => ({ id: o.id, name: o.name }))));
  }, [user]);

  return (
    <div>
      <header className="shell-header">
        <div className="row">
          <strong>{t("app.name")}</strong>
          <select
            value={orgId}
            onChange={(e) => navigate(`/o/${e.target.value}`)}
            style={{ width: "auto", minWidth: 180 }}
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <LangSwitch />
          <span className="muted">{user?.displayName || user?.email}</span>
          <button type="button" className="btn" onClick={() => void logout()}>
            {t("nav.logout")}
          </button>
        </div>
      </header>
      <nav className="shell-nav">
        <NavLink to={`/o/${orgId}`} end className={({ isActive }) => (isActive ? "active" : "")}>
          {t("nav.sites")}
        </NavLink>
        <NavLink to={`/o/${orgId}/team`} className={({ isActive }) => (isActive ? "active" : "")}>
          {t("nav.team")}
        </NavLink>
        <NavLink to={`/o/${orgId}/settings`} className={({ isActive }) => (isActive ? "active" : "")}>
          {t("nav.settings")}
        </NavLink>
      </nav>
      {runtimeUp === false ? (
        <div style={{ padding: "12px 20px" }}>
          <div className="banner warn">{t("runtime.unreachable")}</div>
        </div>
      ) : null}
      <Outlet />
    </div>
  );
}
