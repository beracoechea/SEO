import { ArrowLeft, Ban, Download, Pause, Pencil, Play, Plus, Save, Search, Trash2, UserCheck, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BackLink } from "../components/BackLink";
import { IconBtn } from "../components/IconBtn";
import { useRuntimeReady } from "../components/RuntimeSetupCard";
import { ScanQueue } from "../components/ScanQueue";
import { useAuth } from "../context/AuthContext";
import {
  deleteSite,
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
import { downloadClientInstaller, INSTALLER_RUNTIME_VERSION, installerCorsOrigin } from "../lib/clientInstaller";
import { displayUrl } from "../lib/origin";
import { newSitePath, siteEditPath, sitePath } from "../lib/paths";
import {
  cancelQueued,
  listSiteSummaries,
  reorderQueue,
  resolvedRuntimeUrl,
  runQueuedNow,
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
  const [orgName, setOrgName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [installerBusy, setInstallerBusy] = useState(false);

  const runtime = resolvedRuntimeUrl(org?.runtimeBaseUrl);
  const engine = useRuntimeReady(runtime);

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
    } catch {
      setScores({});
      setScanning(null);
      setQueuedIds([]);
      setQueue([]);
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
    setOrgName(next.name);
    setMaxSites(next.maxSites);
    setMaxPages(next.maxPagesPerSite);
    setMaxMembers(next.maxMembers);
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
    if (!engine.ready) return;
    if (scanning) return;
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
      if (msg === "crawl.alreadyRunning") await refreshScores();
      else if (msg === "Failed to fetch" || msg.includes("NetworkError")) setError(t("crawl.needRuntime"));
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

  async function saveName() {
    if (!orgId) return;
    const name = orgName.trim();
    if (name.length < 2) return;
    setBusy(true);
    setError(null);
    try {
      await updateOrg(orgId, { name });
      await refresh();
      setNote(t("admin.demoRenamed"));
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function removeSite(site: Site) {
    if (!orgId) return;
    if (confirmDelete !== site.id) {
      setConfirmDelete(site.id);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteSite(orgId, site.id, { asPlatformAdmin: true });
      setConfirmDelete(null);
      await refresh();
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  function downloadInstaller() {
    if (!org || installerBusy) return;
    setError(null);
    const project = String(import.meta.env.VITE_FIREBASE_PROJECT_ID || "").trim();
    if (!project) {
      setError(t("admin.installerNeedFirebase"));
      return;
    }
    setInstallerBusy(true);
    try {
      downloadClientInstaller({
        orgId: org.id,
        orgName: org.name,
        firebaseProjectId: project,
        corsOrigin: installerCorsOrigin(),
        runtimeVersion: INSTALLER_RUNTIME_VERSION,
      });
      setNote(t("admin.installerDone"));
      window.setTimeout(() => setInstallerBusy(false), 8000);
    } catch (e) {
      setInstallerBusy(false);
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

      {org.kind === "demo" ? (
        <div className="card stack">
          <label>
            {t("admin.demoOrgName")}
            <input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              maxLength={80}
              placeholder={t("admin.demoOrgPlaceholder")}
            />
          </label>
          <p className="muted">{t("admin.demoRenameHint")}</p>
          <IconBtn
            label={t("common.save")}
            tone="accent"
            showLabel
            disabled={busy || orgName.trim().length < 2 || orgName.trim() === org.name}
            onClick={() => void saveName()}
            icon={<Save size={18} />}
          />
        </div>
      ) : null}

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
          runNowDisabled={Boolean(scanning)}
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

      <div className="card stack">
        <h2 style={{ margin: 0, fontSize: 16 }}>{t("admin.installer")}</h2>
        <IconBtn
          label={installerBusy ? t("engine.downloading") : t("admin.installerDownload")}
          tone="accent"
          showLabel
          disabled={installerBusy}
          onClick={() => downloadInstaller()}
          icon={<Download size={18} />}
        />
      </div>

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
        {sites.length === 0 ? (
          <p className="muted">{org.kind === "demo" ? t("admin.demoSitesEmpty") : t("sites.empty")}</p>
        ) : (
          <div className="table-wrap">
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
                const scanLocked = Boolean(scanning) || queued || !engine.ready;
                const scanLabel = running
                  ? t("crawl.running")
                  : scanning
                    ? t("crawl.alreadyRunning")
                    : queued
                      ? t("sites.queued")
                      : t("crawl.scan");
                return (
                  <tr key={s.id}>
                    <td>
                      {orgId ? (
                        <Link to={sitePath(orgId, s.id, true)}>{s.name}</Link>
                      ) : (
                        s.name
                      )}
                    </td>
                    <td className="cell-url">
                      <a href={s.origin} target="_blank" rel="noreferrer" className="url-clip" title={s.origin}>
                        {displayUrl(s.origin)}
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
                    <td className="cell-actions">
                      <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                        {confirmDelete === s.id && !running ? (
                          <>
                            <IconBtn
                              label={t("sites.deleteYes")}
                              tone="danger"
                              showLabel
                              disabled={busy}
                              onClick={() => void removeSite(s)}
                              icon={<Trash2 size={18} />}
                            />
                            <IconBtn
                              label={t("sites.deleteNo")}
                              disabled={busy}
                              onClick={() => setConfirmDelete(null)}
                              icon={<X size={18} />}
                            />
                          </>
                        ) : (
                          <>
                            <IconBtn
                              label={scanLabel}
                              tone="accent"
                              disabled={scanLocked}
                              onClick={() => void scan(s)}
                              icon={<Play size={18} />}
                            />
                            <IconBtn
                              to={orgId ? siteEditPath(orgId, s.id, true) : undefined}
                              label={running ? t("sites.lockedWhileScanning") : t("sites.edit")}
                              disabled={running}
                              icon={<Pencil size={18} />}
                            />
                            <IconBtn
                              label={running ? t("sites.lockedWhileScanning") : t("sites.delete")}
                              tone="danger"
                              disabled={busy || running}
                              onClick={() => void removeSite(s)}
                              icon={<Trash2 size={18} />}
                            />
                            <IconBtn
                              to={orgId ? sitePath(orgId, s.id, true) : undefined}
                              label={t("admin.audit")}
                              tone="sky"
                              icon={<Search size={18} />}
                            />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
