import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { createSite, isPrivateOrigin } from "../lib/db";

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export function NewSitePage() {
  const { t } = useTranslation();
  const { orgId } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("https://");
  const [maxPages, setMaxPages] = useState(20000);
  const [maxDepth, setMaxDepth] = useState(8);
  const [exclude, setExclude] = useState("");
  const [templates, setTemplates] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSave() {
    if (!orgId) return;
    setError(null);
    if (!origin.startsWith("https://")) {
      setError(t("sites.originInvalid"));
      return;
    }
    if (isPrivateOrigin(origin)) {
      setError(t("sites.originForbidden"));
      return;
    }
    const templateUrls = lines(templates).slice(0, 100);
    setBusy(true);
    try {
      await createSite(orgId, {
        name: name.trim(),
        origin: origin.replace(/\/$/, ""),
        maxPages,
        maxDepth,
        excludePatterns: lines(exclude),
        templateUrls,
      });
      navigate(`/o/${orgId}`);
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page stack">
      <h1>{t("sites.add")}</h1>
      {error ? <div className="banner warn">{error}</div> : null}
      <div className="card stack">
        <label>
          {t("sites.name")}
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {t("sites.origin")}
          <input value={origin} onChange={(e) => setOrigin(e.target.value)} />
        </label>
        <label>
          {t("sites.maxPages")}
          <input type="number" min={1} value={maxPages} onChange={(e) => setMaxPages(Number(e.target.value))} />
        </label>
        <label>
          {t("sites.maxDepth")}
          <input type="number" min={1} value={maxDepth} onChange={(e) => setMaxDepth(Number(e.target.value))} />
        </label>
        <label>
          {t("sites.exclude")}
          <textarea rows={4} value={exclude} onChange={(e) => setExclude(e.target.value)} />
        </label>
        <label>
          {t("sites.templates")}
          <textarea rows={4} value={templates} onChange={(e) => setTemplates(e.target.value)} />
        </label>
        <div className="row">
          <button type="button" className="btn" onClick={() => navigate(-1)}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || name.trim().length < 2}
            onClick={() => void onSave()}
          >
            {t("sites.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
