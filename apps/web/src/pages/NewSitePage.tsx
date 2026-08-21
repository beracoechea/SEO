import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BackLink } from "../components/BackLink";
import { IconBtn } from "../components/IconBtn";
import { createSite, deleteSite, getOrg, getSite, isPrivateOrigin, updateSite, type RenderJs } from "../lib/db";
import { isFirestoreNetworkError } from "../lib/firebase";
import { isAdminPath, orgHomePath, sitePath } from "../lib/paths";
import { listSiteSummaries, resolvedRuntimeUrl } from "../lib/runtime";

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export function NewSitePage() {
  const { t } = useTranslation();
  const { orgId, siteId } = useParams();
  const navigate = useNavigate();
  const fromAdmin = isAdminPath(useLocation().pathname);
  const editing = Boolean(siteId);
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("https://");
  const [maxPages, setMaxPages] = useState(20000);
  const [maxDepth, setMaxDepth] = useState(8);
  const [scanEvery, setScanEvery] = useState<"off" | "day" | "3days" | "week" | "month">("off");
  const [renderJs, setRenderJs] = useState<RenderJs>("auto");
  const [exclude, setExclude] = useState("");
  const [templates, setTemplates] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!orgId || !siteId) return;
    void getSite(orgId, siteId)
      .then((site) => {
        if (!site) {
          setError(t("errors.generic"));
          return;
        }
        setName(site.name);
        setOrigin(site.origin);
        setMaxPages(site.maxPages);
        setMaxDepth(site.maxDepth);
        setScanEvery(site.scanEvery || "off");
        setRenderJs(site.renderJs || "auto");
        setExclude(site.excludePatterns.join("\n"));
        setTemplates(site.templateUrls.join("\n"));
      })
      .catch((e) => setError(isFirestoreNetworkError(e) ? t("errors.firestoreNetwork") : t("errors.generic")));
  }, [orgId, siteId, t]);

  useEffect(() => {
    if (!orgId || !siteId) return;
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const org = await getOrg(orgId);
        const overview = await listSiteSummaries(resolvedRuntimeUrl(org?.runtimeBaseUrl));
        if (cancelled) return;
        const active =
          overview.active?.site_id === siteId ||
          overview.sites.some((row) => row.site_id === siteId && row.status === "running");
        setScanning(active);
        if (active) timer = window.setTimeout(() => void tick(), 1500);
      } catch {
        if (!cancelled) setScanning(false);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [orgId, siteId]);

  async function onSave() {
    if (!orgId) return;
    if (scanning) {
      setError(t("sites.lockedWhileScanning"));
      return;
    }
    setError(null);
    if (!origin.startsWith("https://")) {
      setError(t("sites.originInvalid"));
      return;
    }
    if (isPrivateOrigin(origin)) {
      setError(t("sites.originForbidden"));
      return;
    }
    const payload = {
      name: name.trim(),
      origin: origin.replace(/\/$/, ""),
      maxPages,
      maxDepth,
      scanEvery,
      renderJs,
      excludePatterns: lines(exclude),
      templateUrls: lines(templates).slice(0, 100),
    };
    setBusy(true);
    try {
      if (siteId) await updateSite(orgId, siteId, payload, { asPlatformAdmin: fromAdmin });
      else await createSite(orgId, payload, { asPlatformAdmin: fromAdmin });
      navigate(orgHomePath(orgId, fromAdmin));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "sites-quota") setError(t("sites.quotaReached"));
      else if (msg === "org-suspended") setError(t("org.suspended"));
      else if (isFirestoreNetworkError(e)) setError(t("errors.firestoreNetwork"));
      else setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!orgId || !siteId) return;
    if (scanning) {
      setError(t("sites.lockedWhileScanning"));
      setConfirmDelete(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteSite(orgId, siteId, { asPlatformAdmin: fromAdmin });
      navigate(orgHomePath(orgId, fromAdmin));
    } catch (e) {
      if (e instanceof Error && e.message === "org-suspended") setError(t("org.suspended"));
      else if (isFirestoreNetworkError(e)) setError(t("errors.firestoreNetwork"));
      else setError(t("errors.generic"));
      setBusy(false);
    }
  }

  return (
    <div className="page stack">
      <BackLink
        to={editing && orgId && siteId ? sitePath(orgId, siteId, fromAdmin) : orgId ? orgHomePath(orgId, fromAdmin) : "/"}
        label={editing ? t("audit.title") : fromAdmin ? t("admin.sitesOfOrg") : t("nav.sites")}
        icon={<ArrowLeft size={20} />}
      />
      <h1>{editing ? t("sites.edit") : t("sites.add")}</h1>
      {scanning ? <div className="banner warn">{t("sites.lockedWhileScanning")}</div> : null}
      {error ? <div className="banner warn">{error}</div> : null}
      <div className="card stack">
        <fieldset className="stack" disabled={scanning} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <label>
          {t("sites.name")}
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {t("sites.origin")}
          <input value={origin} onChange={(e) => setOrigin(e.target.value)} />
        </label>
        {editing ? <p className="muted">{t("sites.originChangeHint")}</p> : null}
        <label>
          {t("sites.maxPages")}
          <input type="number" min={1} value={maxPages} onChange={(e) => setMaxPages(Number(e.target.value))} />
        </label>
        <label>
          {t("sites.maxDepth")}
          <input type="number" min={1} value={maxDepth} onChange={(e) => setMaxDepth(Number(e.target.value))} />
        </label>
        <label>
          {t("sites.scanEvery")}
          <select value={scanEvery} onChange={(e) => setScanEvery(e.target.value as typeof scanEvery)}>
            <option value="off">{t("sites.scanOff")}</option>
            <option value="day">{t("sites.scanDay")}</option>
            <option value="3days">{t("sites.scan3days")}</option>
            <option value="week">{t("sites.scanWeek")}</option>
            <option value="month">{t("sites.scanMonth")}</option>
          </select>
        </label>
        <p className="muted">{t("sites.scanHint")}</p>
        <label>
          {t("sites.renderJs")}
          <select value={renderJs} onChange={(e) => setRenderJs(e.target.value as RenderJs)}>
            <option value="auto">{t("sites.renderAuto")}</option>
            <option value="on">{t("sites.renderOn")}</option>
            <option value="off">{t("sites.renderOff")}</option>
          </select>
        </label>
        <p className="muted">{t("sites.renderHint")}</p>
        <label>
          {t("sites.exclude")}
          <textarea rows={4} value={exclude} onChange={(e) => setExclude(e.target.value)} />
        </label>
        <label>
          {t("sites.templates")}
          <textarea rows={4} value={templates} onChange={(e) => setTemplates(e.target.value)} />
        </label>
        <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
          <IconBtn
            label={t("sites.save")}
            tone="accent"
            showLabel
            disabled={busy || scanning || name.trim().length < 2}
            onClick={() => void onSave()}
            icon={<Save size={18} />}
          />
        </div>
        </fieldset>
      </div>
      {editing ? (
        <div className="card stack">
          <strong>{t("sites.delete")}</strong>
          <p className="muted">{scanning ? t("sites.lockedWhileScanning") : t("sites.deleteHint")}</p>
          {confirmDelete && !scanning ? (
            <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
              <IconBtn
                label={t("sites.deleteYes")}
                tone="danger"
                showLabel
                disabled={busy}
                onClick={() => void onDelete()}
                icon={<Trash2 size={18} />}
              />
              <IconBtn label={t("sites.deleteNo")} showLabel disabled={busy} onClick={() => setConfirmDelete(false)} icon={<ArrowLeft size={18} />} />
            </div>
          ) : (
            <IconBtn
              label={t("sites.delete")}
              tone="danger"
              showLabel
              disabled={busy || scanning}
              onClick={() => setConfirmDelete(true)}
              icon={<Trash2 size={18} />}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
