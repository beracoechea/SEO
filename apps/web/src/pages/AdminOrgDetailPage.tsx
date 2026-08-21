import { ArrowLeft, Ban, Download, Pause, Play, Plus, Save, Search, UserCheck, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertSettings } from "../components/AlertSettings";
import { IconBtn } from "../components/IconBtn";
import { ScanQueue } from "../components/ScanQueue";
import { useAuth } from "../context/AuthContext";
import {
  getOrg,
  grantOrgAccess,
  listMembers,
  listOrgInvites,
  listSites,
  restoreOrgAccess,
  revokeOrgAccess,
  updateOrg,
  updateOrgEntitlements,
  updateSiteMaxPages,
  type Invite,
  type Member,
  type Org,
  type Role,
  type Site,
} from "../lib/db";
import { defaultShellOrigin, downloadClientInstaller, INSTALLER_RUNTIME_VERSION } from "../lib/clientInstaller";
import { newSitePath, sitePath } from "../lib/paths";
import {
  cancelQueued,
  listSiteSummaries,
  reorderQueue,
  resolvedRuntimeUrl,
  runQueuedNow,
  saveRuntimeAlerts,
  startCrawl,
  syncSchedule,
  type CrawlRow,
  type QueueItem,
} from "../lib/runtime";

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
  const [scores, setScores] = useState<Record<string, CrawlRow>>({});
  const [scanning, setScanning] = useState<string | null>(null);
  const [queuedIds, setQueuedIds] = useState<string[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [runtimeDown, setRuntimeDown] = useState(false);
  const [shellOrigin, setShellOrigin] = useState(() =>
    typeof window !== "undefined" ? defaultShellOrigin(window.location.origin) : "",
  );
  const [lanUrl, setLanUrl] = useState("");
  const [alertWebhook, setAlertWebhook] = useState("");
  const [alertEmail, setAlertEmail] = useState("");

  const runtime = resolvedRuntimeUrl(org?.runtimeBaseUrl);

  const refreshScores = useCallback(async () => {
    if (!org) return;
    try {
      const overview = await listSiteSummaries(runtime);
      const map: Record<string, CrawlRow> = {};
      for (const row of overview.sites) map[row.site_id] = row;
      setScores(map);
      setScanning(overview.active?.site_id ?? null);
      setQueuedIds((overview.queue || []).map((q) => q.site_id));
      setQueue(overview.queue || []);
      setRuntimeDown(false);
      setAlertWebhook(overview.alerts.webhook);
      setAlertEmail(overview.alerts.email);
    } catch {
      setScores({});
      setScanning(null);
      setQueuedIds([]);
      setQueue([]);
      setRuntimeDown(true);
    }
  }, [org, runtime]);

  async function refresh() {
    if (!orgId) return;
    const next = await getOrg(orgId);
    if (!next) {
      setOrg(null);
      return;
    }
    const [m, s, inv] = await Promise.all([
      listMembers(orgId, { includeRevoked: true }),
      listSites(orgId),
      listOrgInvites(orgId),
    ]);
    setOrg(next);
    setMaxSites(next.maxSites);
    setMaxPages(next.maxPagesPerSite);
    setMaxMembers(next.maxMembers);
    setLanUrl(next.runtimeBaseUrl || "");
    setMembers(m);
    setSites(s);
    setInvites(inv);
  }

  useEffect(() => {
    void refresh().catch(() => setError(t("errors.generic")));
  }, [orgId, t]);

  useEffect(() => {
    if (!org) return;
    void syncSchedule(
      runtime,
      sites.map((s) => ({
        id: s.id,
        origin: s.origin,
        templateUrls: s.templateUrls,
        maxPages: Math.min(s.maxPages || 20000, org.maxPagesPerSite || 20000),
        maxDepth: s.maxDepth || 8,
        scanEvery: s.scanEvery || "off",
        renderJs: s.renderJs || "auto",
      })),
      org.defaultRateLimit || 10,
    )
      .then(() => refreshScores())
      .catch(() => void refreshScores());
  }, [org, runtime, sites, refreshScores]);

  useEffect(() => {
    if (!scanning && queuedIds.length === 0) return;
    const id = window.setInterval(() => void refreshScores(), 1200);
    return () => window.clearInterval(id);
  }, [scanning, queuedIds.length, refreshScores]);

  async function scan(site: Site) {
    if (!org) return;
    if (queuedIds.includes(site.id) || scanning === site.id) return;
    setError(null);
    try {
      await startCrawl(runtime, site.id, {
        kind: "site",
        origin: site.origin,
        templateUrls: site.templateUrls,
        rateLimit: org.defaultRateLimit || 10,
        maxPages: Math.min(site.maxPages || 20000, org.maxPagesPerSite || 20000),
        maxDepth: site.maxDepth || 8,
        scanEvery: site.scanEvery,
        renderJs: site.renderJs,
      });
      await refreshScores();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "Failed to fetch" || msg.includes("NetworkError")) setError(t("crawl.needRuntime"));
      else setError(t("crawl.failed"));
    }
  }

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

  async function saveLanUrl() {
    if (!orgId) return;
    setBusy(true);
    setError(null);
    try {
      const value = lanUrl.trim().replace(/\/$/, "") || null;
      await updateOrg(orgId, { runtimeBaseUrl: value });
      await refresh();
      setNote(t("admin.installerLanSaved"));
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function saveAlerts(next: { webhook: string; email: string }) {
    setBusy(true);
    setError(null);
    try {
      await saveRuntimeAlerts(runtime, next);
      setAlertWebhook(next.webhook);
      setAlertEmail(next.email);
      setNote(t("alerts.saved"));
    } catch {
      setError(t("crawl.needRuntime"));
    } finally {
      setBusy(false);
    }
  }

  function downloadInstaller() {
    if (!org) return;
    setError(null);
    const project = String(import.meta.env.VITE_FIREBASE_PROJECT_ID || "").trim();
    if (!project) {
      setError(t("admin.installerNeedFirebase"));
      return;
    }
    try {
      downloadClientInstaller({
        orgId: org.id,
        orgName: org.name,
        firebaseProjectId: project,
        corsOrigin: shellOrigin,
        runtimeVersion: INSTALLER_RUNTIME_VERSION,
      });
      setNote(t("admin.installerDone"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "installer.corsHttps") setError(t("admin.installerNeedHttps"));
      else setError(t("errors.generic"));
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
          <BackLink to={org.kind === "demo" ? "/admin/demos" : "/admin"} label={org.kind === "demo" ? t("admin.navDemos") : t("admin.navOrgs")} icon={<ArrowLeft size={20} />} />
          <h1 style={{ margin: "8px 0 0" }}>{org.name}</h1>
        </div>
        {org.kind === "demo" ? null : (
        <IconBtn
          label={org.status === "suspended" ? t("admin.activate") : t("admin.suspend")}
          tone={org.status === "suspended" ? "accent" : "danger"}
          disabled={busy}
          onClick={() => void toggleStatus()}
          icon={org.status === "suspended" ? <Play size={18} /> : <Pause size={18} />}
        />
        )}
      </div>
      {org.kind === "demo" ? <div className="banner ok">{t("admin.demoBanner")}</div> : null}
      {org.status === "suspended" ? <div className="banner warn">{t("admin.orgSuspended")}</div> : null}
      {error ? <div className="banner warn">{error}</div> : null}
      {note ? <div className="banner ok">{note}</div> : null}

      {scanning || queue.length ? (
        <ScanQueue
          runningName={sites.find((s) => s.id === scanning)?.name}
          items={queue}
          sites={sites}
          onMove={(ids) => reorderQueue(runtime, ids).then(() => refreshScores()).catch(() => setError(t("crawl.failed")))}
          onCancel={(id) =>
            cancelQueued(runtime, id)
              .then(() => refreshScores())
              .catch(() => {
                setError(t("crawl.failed"));
                throw new Error("queue.cancel");
              })
          }
          onRunNow={(id) => runQueuedNow(runtime, id).then(() => refreshScores()).catch(() => setError(t("crawl.failed")))}
        />
      ) : null}

      {org.kind !== "demo" ? (
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
      ) : null}

      {org.kind !== "demo" ? (
      <div className="card stack">
        <h2 style={{ margin: 0, fontSize: 16 }}>{t("admin.installer")}</h2>
        <p className="muted">{t("admin.installerHint")}</p>
        <label>
          {t("admin.installerOrgId")}
          <input value={org.id} readOnly onFocus={(e) => e.target.select()} />
        </label>
        <label>
          {t("admin.installerShell")}
          <input
            value={shellOrigin}
            placeholder="https://tu-app.web.app"
            onChange={(e) => setShellOrigin(e.target.value)}
          />
        </label>
        <p className="muted">{t("admin.installerShellHint")}</p>
        <IconBtn
          label={t("admin.installerDownload")}
          tone="accent"
          showLabel
          onClick={() => downloadInstaller()}
          icon={<Download size={18} />}
        />
        <label>
          {t("admin.installerLan")}
          <input
            value={lanUrl}
            placeholder="http://192.168.1.20:8080"
            onChange={(e) => setLanUrl(e.target.value)}
          />
        </label>
        <p className="muted">{t("admin.installerLanHint")}</p>
        <IconBtn
          label={t("admin.installerLanSave")}
          showLabel
          disabled={busy}
          onClick={() => void saveLanUrl()}
          icon={<Save size={18} />}
        />
      </div>
      ) : null}

      <AlertSettings
        webhook={alertWebhook}
        email={alertEmail}
        busy={busy}
        onSave={saveAlerts}
      />

      {org.kind !== "demo" ? (
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
      ) : null}

      <div className="card stack">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16 }}>{t("admin.sitesOfOrg")}</h2>
            <p className="muted">{org.kind === "demo" ? t("admin.demoSitesHint") : t("admin.sitesHint")}</p>
          </div>
          <IconBtn
            to={orgId ? newSitePath(orgId, true) : undefined}
            label={t("sites.add")}
            tone="accent"
            showLabel
            icon={<Plus size={18} />}
          />
        </div>
        {runtimeDown ? <div className="banner warn">{t("admin.runtimeDown")}</div> : null}
        {sites.length === 0 ? (
          <p className="muted">{org.kind === "demo" ? t("admin.demoSitesEmpty") : t("sites.empty")}</p>
        ) : (
          <table className="site-table">
            <thead>
              <tr>
                <th>{t("sites.name")}</th>
                <th>{t("sites.origin")}</th>
                <th>{t("admin.pagesHaveAllowed")}</th>
                <th>{t("audit.score")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => {
                const row = scores[s.id];
                const running = scanning === s.id || row?.status === "running";
                const queued = queuedIds.includes(s.id);
                return (
                  <tr key={s.id}>
                    <td>
                      {orgId ? (
                        <Link to={sitePath(orgId, s.id, true)}>{s.name}</Link>
                      ) : (
                        s.name
                      )}
                    </td>
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
                    <td>
                      {running
                        ? t("crawl.running")
                        : queued
                          ? t("sites.queued")
                          : row?.status === "done" && row.score != null
                            ? row.score
                            : t("sites.never")}
                    </td>
                    <td>
                      <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                        <IconBtn
                          label={running ? t("crawl.running") : queued ? t("sites.queued") : t("crawl.scan")}
                          tone="accent"
                          disabled={running || queued}
                          onClick={() => void scan(s)}
                          icon={<Play size={18} />}
                        />
                        <IconBtn
                          to={orgId ? sitePath(orgId, s.id, true) : undefined}
                          label={t("admin.audit")}
                          tone="sky"
                          icon={<Search size={18} />}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
