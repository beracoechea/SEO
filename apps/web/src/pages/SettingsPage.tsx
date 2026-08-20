import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getOrg, pingRuntime, updateOrg } from "../lib/db";

export function SettingsPage() {
  const { t } = useTranslation();
  const { orgId } = useParams();
  const [name, setName] = useState("");
  const [runtime, setRuntime] = useState("");
  const [rate, setRate] = useState(4);
  const [ping, setPing] = useState<"idle" | "ok" | "fail">("idle");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    void getOrg(orgId).then((o) => {
      if (!o) return;
      setName(o.name);
      setRuntime(o.runtimeBaseUrl ?? "");
      setRate(o.defaultRateLimit);
    });
  }, [orgId]);

  async function onSave() {
    if (!orgId) return;
    await updateOrg(orgId, {
      name: name.trim(),
      runtimeBaseUrl: runtime.trim() || null,
      defaultRateLimit: rate,
    });
    setSaved(true);
  }

  async function onTest() {
    const ok = await pingRuntime(runtime.trim());
    setPing(ok ? "ok" : "fail");
  }

  return (
    <div className="page stack">
      <h1>{t("settings.title")}</h1>
      <div className="card stack">
        <label>
          {t("settings.orgName")}
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {t("settings.runtimeUrl")}
          <input value={runtime} onChange={(e) => setRuntime(e.target.value)} placeholder="http://192.168.1.10:8080" />
        </label>
        <p className="muted">{t("settings.runtimeHint")}</p>
        <div className="row">
          <button type="button" className="btn" onClick={() => void onTest()}>
            {t("settings.testRuntime")}
          </button>
          {ping === "ok" ? <span className="banner ok">{t("settings.runtimeOk")}</span> : null}
          {ping === "fail" ? <span className="banner warn">{t("settings.runtimeFail")}</span> : null}
        </div>
        <label>
          {t("settings.rateLimit")}: {rate}
          <input type="range" min={3} max={8} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
        </label>
        <button type="button" className="btn btn-primary" onClick={() => void onSave()}>
          {t("settings.save")}
        </button>
        {saved ? <p className="muted">{t("common.save")}</p> : null}
      </div>
      <p className="muted">{t("score.disclaimer")}</p>
    </div>
  );
}
