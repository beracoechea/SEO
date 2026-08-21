import { Ban, Pause, Play, Save, UserCheck, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IconBtn } from "../components/IconBtn";
import { useAuth } from "../context/AuthContext";
import {
  getOrg,
  grantOrgAccess,
  listMembers,
  listOrgInvites,
  listSites,
  restoreOrgAccess,
  revokeOrgAccess,
  updateOrgEntitlements,
  updateSiteMaxPages,
  type Invite,
  type Member,
  type Org,
  type Role,
  type Site,
} from "../lib/db";

export function AdminOrgDetailPage() {
  const { t } = useTranslation();
  const { orgId } = useParams();
  const { user } = useAuth();
  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [maxSites, setMaxSites] = useState(5);
  const [maxPages, setMaxPages] = useState(20000);
  const [maxMembers, setMaxMembers] = useState(10);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!orgId) return;
    const next = await getOrg(orgId);
    setOrg(next);
    if (!next) return;
    setMaxSites(next.maxSites);
    setMaxPages(next.maxPagesPerSite);
    setMaxMembers(next.maxMembers);
    const [m, s, inv] = await Promise.all([
      listMembers(orgId, { includeRevoked: true }),
      listSites(orgId),
      listOrgInvites(orgId),
    ]);
    setMembers(m);
    setSites(s);
    setInvites(inv);
  }

  useEffect(() => {
    void refresh().catch(() => setError(t("errors.generic")));
  }, [orgId, t]);

  const activeUsers = members.filter((m) => m.access === "active").length;

  async function saveEntitlements() {
    if (!orgId) return;
    setBusy(true);
    setError(null);
    try {
      await updateOrgEntitlements(orgId, {
        maxSites: Math.max(1, maxSites),
        maxPagesPerSite: Math.max(1, maxPages),
        maxMembers: Math.max(1, maxMembers),
      });
      await refresh();
      setNote(t("admin.saved"));
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    if (!orgId || !org) return;
    setBusy(true);
    try {
      await updateOrgEntitlements(orgId, {
        status: org.status === "active" ? "suspended" : "active",
      });
      await refresh();
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function onGrant() {
    if (!orgId || !org || !user) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const kind = await grantOrgAccess({
        orgId,
        orgName: org.name,
        email,
        role,
        grantedByUid: user.uid,
      });
      setEmail("");
      setNote(kind === "invite" ? t("admin.invited") : t("admin.granted"));
      await refresh();
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  if (!org) {
    return (
      <div className="page">
        <p className="muted">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="page page-wide stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <Link to="/admin" className="muted">
            ← {t("admin.navOrgs")}
          </Link>
          <h1 style={{ margin: "8px 0 0" }}>{org.name}</h1>
        </div>
        <IconBtn
          label={org.status === "suspended" ? t("admin.activate") : t("admin.suspend")}
          tone={org.status === "suspended" ? "accent" : "danger"}
          disabled={busy}
          onClick={() => void toggleStatus()}
          icon={org.status === "suspended" ? <Play size={18} /> : <Pause size={18} />}
        />
      </div>
      {org.status === "suspended" ? <div className="banner warn">{t("admin.orgSuspended")}</div> : null}
      {error ? <div className="banner warn">{error}</div> : null}
      {note ? <div className="banner ok">{note}</div> : null}

      <div className="card stack">
        <h2 style={{ margin: 0, fontSize: 16 }}>{t("admin.entitlements")}</h2>
        <p className="muted">{t("admin.entitlementsHint")}</p>
        <div className="row">
          <label style={{ flex: 1 }}>
            {t("admin.maxSites")}
            <input type="number" min={1} value={maxSites} onChange={(e) => setMaxSites(Number(e.target.value))} />
          </label>
          <label style={{ flex: 1 }}>
            {t("admin.maxPagesPerSite")}
            <input type="number" min={1} value={maxPages} onChange={(e) => setMaxPages(Number(e.target.value))} />
          </label>
          <label style={{ flex: 1 }}>
            {t("admin.maxMembers")}
            <input type="number" min={1} value={maxMembers} onChange={(e) => setMaxMembers(Number(e.target.value))} />
          </label>
        </div>
        <p className="muted">
          {t("admin.haveVsAllowed", {
            users: `${activeUsers} / ${org.maxMembers}`,
            sites: `${sites.length} / ${org.maxSites}`,
            pages: org.maxPagesPerSite.toLocaleString(),
          })}
        </p>
        <IconBtn label={t("common.save")} tone="accent" showLabel disabled={busy} onClick={() => void saveEntitlements()} icon={<Save size={18} />} />
      </div>

      <div className="card stack">
        <h2 style={{ margin: 0, fontSize: 16 }}>{t("admin.usersOfOrg")}</h2>
        <div className="row">
          <label style={{ flex: 1 }}>
            {t("team.email")}
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label style={{ width: 160 }}>
            {t("team.role")}
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="member">{t("team.member")}</option>
              <option value="owner">{t("team.owner")}</option>
            </select>
          </label>
          <IconBtn
            label={t("admin.grant")}
            tone="accent"
            showLabel
            disabled={busy || !email.includes("@")}
            onClick={() => void onGrant()}
            icon={<UserPlus size={18} />}
          />
        </div>
        <table className="site-table">
          <thead>
            <tr>
              <th>{t("team.email")}</th>
              <th>{t("common.role")}</th>
              <th>{t("admin.access")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.uid}>
                <td>{m.email}</td>
                <td>{m.role === "owner" ? t("team.owner") : t("team.member")}</td>
                <td>{m.access === "revoked" ? t("admin.revoked") : t("admin.active")}</td>
                <td>
                  {m.access === "revoked" ? (
                    <IconBtn
                      label={t("admin.grant")}
                      tone="accent"
                      disabled={busy}
                      onClick={() => orgId && void restoreOrgAccess(orgId, m.uid, m.role, org.name).then(refresh)}
                      icon={<UserCheck size={18} />}
                    />
                  ) : (
                    <IconBtn
                      label={t("admin.revoke")}
                      tone="danger"
                      disabled={busy}
                      onClick={() => orgId && void revokeOrgAccess(orgId, m.uid).then(refresh)}
                      icon={<Ban size={18} />}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {invites.length > 0 ? (
          <p className="muted">
            {t("admin.pendingInvites")}: {invites.map((i) => i.email).join(", ")}
          </p>
        ) : null}
      </div>

      <div className="card stack">
        <h2 style={{ margin: 0, fontSize: 16 }}>{t("admin.sitesOfOrg")}</h2>
        <p className="muted">{t("admin.sitesHint")}</p>
        {sites.length === 0 ? (
          <p className="muted">{t("sites.empty")}</p>
        ) : (
          <table className="site-table">
            <thead>
              <tr>
                <th>{t("sites.name")}</th>
                <th>{t("sites.origin")}</th>
                <th>{t("admin.pagesHaveAllowed")}</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>
                    <a href={s.origin} target="_blank" rel="noreferrer">
                      {s.origin}
                    </a>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      max={org.maxPagesPerSite}
                      defaultValue={s.maxPages}
                      style={{ width: 120, display: "inline-block", marginRight: 8 }}
                      onBlur={(e) => {
                        if (!orgId) return;
                        const n = Number(e.target.value);
                        if (!n || n === s.maxPages) return;
                        void updateSiteMaxPages(orgId, s.id, n).then(refresh);
                      }}
                    />
                    <span className="muted">/ {org.maxPagesPerSite.toLocaleString()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
