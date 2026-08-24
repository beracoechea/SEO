import { Download, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { downloadOrgInstaller } from "../lib/clientInstaller";
import { pingRuntime } from "../lib/runtime";
import { requestLocalRuntimeStart } from "../lib/runtimeLaunch";
import { IconBtn } from "./IconBtn";

const START_WAIT_MS = 25000;
const START_POLL_MS = 1500;

export function useRuntimeReady(runtimeUrl: string) {
  const [status, setStatus] = useState<"checking" | "ready" | "missing" | "starting">("checking");

  const retry = useCallback(async () => {
    setStatus("starting");
    requestLocalRuntimeStart();
    const deadline = Date.now() + START_WAIT_MS;
    while (Date.now() < deadline) {
      const ok = await pingRuntime(runtimeUrl);
      if (ok) {
        setStatus("ready");
        return true;
      }
      await new Promise((resolve) => window.setTimeout(resolve, START_POLL_MS));
    }
    setStatus("missing");
    return false;
  }, [runtimeUrl]);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const loop = async () => {
      const ok = await pingRuntime(runtimeUrl);
      if (cancelled) return;
      setStatus((current) => (current === "starting" ? current : ok ? "ready" : "missing"));
      timer = window.setTimeout(() => void loop(), ok ? 15000 : 8000);
    };
    void loop();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [runtimeUrl]);

  return {
    status,
    ready: status === "ready",
    missing: status === "missing",
    checking: status === "checking",
    starting: status === "starting",
    retry,
  };
}

export function RuntimeSetupCard({
  org,
  missing,
  checking,
  starting,
  onRetry,
}: {
  org: { id: string; name: string };
  missing: boolean;
  checking: boolean;
  starting?: boolean;
  onRetry: () => void | Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  if (checking && !missing && !starting) {
    return <p className="muted">{t("engine.checking")}</p>;
  }
  if (!missing && !starting) return null;

  function download() {
    if (downloading) return;
    setDownloading(true);
    setError(null);
    try {
      downloadOrgInstaller(org);
      setNote(t("engine.downloaded"));
    } catch {
      setError(t("engine.downloadFailed"));
      setDownloading(false);
      return;
    }
    window.setTimeout(() => setDownloading(false), 8000);
  }

  return (
    <div className="card stack engine-setup">
      <h2 style={{ margin: 0, fontSize: 18 }}>{t("engine.setupTitle")}</h2>
      <p className="muted">{t("engine.setupBody")}</p>
      <ol className="engine-steps">
        <li>{t("engine.step1")}</li>
        <li>{t("engine.step2")}</li>
        <li>{t("engine.step3")}</li>
      </ol>
      <p className="muted">{t("engine.consoleHint")}</p>
      {starting ? <div className="banner ok">{t("engine.starting")}</div> : null}
      {note ? <div className="banner ok">{note}</div> : null}
      {error ? <div className="banner warn">{error}</div> : null}
      <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
        <IconBtn
          label={downloading ? t("engine.downloading") : t("engine.download")}
          tone="accent"
          showLabel
          disabled={downloading || starting}
          onClick={() => download()}
          icon={<Download size={18} />}
        />
        <IconBtn
          label={starting ? t("engine.startingShort") : t("engine.retry")}
          showLabel
          disabled={starting}
          onClick={() => void onRetry()}
          icon={<RefreshCw size={18} />}
        />
      </div>
    </div>
  );
}
