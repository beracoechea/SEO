import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { LayoutGrid, LogOut, Settings, Shield, Users } from "lucide-react";
import { LangSwitch } from "../components/LangSwitch";
import { IconBtn } from "../components/IconBtn";
import { useAuth } from "../context/AuthContext";
import { getOrg, listMyOrgs, pingRuntime, type Org } from "../lib/db";
import { resolvedRuntimeUrl } from "../lib/runtime";

export function Shell() {
  const { t } = useTranslation();
  const { orgId } = useParams();
  const { user, logout, platformAdmin } = useAuth();
  const navigate = useNavigate();
  const [runtimeUp, setRuntimeUp] = useState<boolean | null>(null);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [org, setOrg] = useState<Org | null>(null);
  const initial = (user?.displayName || user?.email || "?").slice(0, 1).toUpperCase();

  useEffect(() => {
    if (!orgId) return;
    let tries = 0;
    let timer: number | undefined;
    void getOrg(orgId).then((o) => {
      setOrg(o);
      const url = resolvedRuntimeUrl(o?.runtimeBaseUrl);
      const tick = () => {
        void pingRuntime(url).then((ok) => {
          if (ok) {
            setRuntimeUp(true);
            return;
          }
          if (tries >= 12) {
            setRuntimeUp(false);
            return;
          }
          tries += 1;
          timer = window.setTimeout(tick, 1500);
        });
      };
      tick();
    });
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [orgId]);

  useEffect(() => {
    if (!user) return;
    void listMyOrgs(user.uid).then((list) => setOrgs(list.map((o) => ({ id: o.id, name: o.name }))));
  }, [user]);

  return (
    <div className="app-shell">
      <header className="app-bar">
        <div className="avatar" title={user?.displayName || user?.email || ""}>
          {initial}
        </div>
        <select
          className="org-select"
          value={orgId}
          aria-label={t("orgs.title")}
          onChange={(e) => navigate(`/o/${e.target.value}`)}
        >
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <LangSwitch />
        {platformAdmin ? (
          <IconBtn to="/admin" label={t("nav.admin")} tone="sky" icon={<Shield size={20} />} />
        ) : null}
        <IconBtn label={t("nav.logout")} tone="danger" onClick={() => void logout()} icon={<LogOut size={20} />} />
      </header>

      {org?.status === "suspended" ? (
        <div className="app-alerts">
          <div className="banner warn">{t("org.suspended")}</div>
        </div>
      ) : null}
      {runtimeUp === false ? (
        <div className="app-alerts">
          <div className="banner warn">{t("runtime.unreachable")}</div>
        </div>
      ) : null}

      <div className="app-body">
        <Outlet />
      </div>

      <nav className="tab-bar" aria-label={t("app.name")}>
        <NavLink to={`/o/${orgId}`} end className={({ isActive }) => (isActive ? "tab active" : "tab")}>
          <LayoutGrid size={22} />
          <span>{t("nav.sites")}</span>
        </NavLink>
        <NavLink to={`/o/${orgId}/team`} className={({ isActive }) => (isActive ? "tab active" : "tab")}>
          <Users size={22} />
          <span>{t("nav.team")}</span>
        </NavLink>
        <NavLink to={`/o/${orgId}/settings`} className={({ isActive }) => (isActive ? "tab active" : "tab")}>
          <Settings size={22} />
          <span>{t("nav.settings")}</span>
        </NavLink>
      </nav>
    </div>
  );
}
