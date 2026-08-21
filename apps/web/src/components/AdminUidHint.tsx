import { Copy } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IconBtn } from "./IconBtn";

export function AdminUidHint({ uid }: { uid: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(uid);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="banner warn stack">
      <p style={{ margin: 0 }}>{t("admin.uidHint")}</p>
      <div className="row">
        <code className="uid-box">{uid}</code>
        <IconBtn label={copied ? t("common.copied") : t("common.copy")} tone="sky" onClick={() => void copy()} icon={<Copy size={18} />} />
      </div>
      <p className="muted" style={{ margin: 0 }}>
        {t("admin.uidFields")}
      </p>
    </div>
  );
}
