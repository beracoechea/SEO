import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconBtn } from "./IconBtn";

type Props = {
  webhook: string;
  email: string;
  busy?: boolean;
  onSave: (next: { webhook: string; email: string }) => Promise<void>;
};

export function AlertSettings({ webhook, email, busy, onSave }: Props) {
  const { t } = useTranslation();
  const [hook, setHook] = useState(webhook);
  const [mail, setMail] = useState(email);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setHook(webhook);
    setMail(email);
  }, [webhook, email]);

  async function save() {
    setSaving(true);
    try {
      await onSave({ webhook: hook.trim(), email: mail.trim() });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card stack">
      <h2 style={{ margin: 0, fontSize: 16 }}>{t("alerts.title")}</h2>
      <p className="muted">{t("alerts.hint")}</p>
      <label>
        {t("alerts.webhook")}
        <input
          value={hook}
          placeholder="https://hooks.example.com/seo-404"
          onChange={(e) => setHook(e.target.value)}
        />
      </label>
      <p className="muted">{t("alerts.webhookHint")}</p>
      <label>
        {t("alerts.email")}
        <input
          value={mail}
          placeholder="webmaster@empresa.com, seo@empresa.com"
          onChange={(e) => setMail(e.target.value)}
        />
      </label>
      <p className="muted">{t("alerts.emailHint")}</p>
      <IconBtn
        label={t("common.save")}
        tone="accent"
        showLabel
        disabled={busy || saving}
        onClick={() => void save()}
        icon={<Save size={18} />}
      />
    </div>
  );
}
