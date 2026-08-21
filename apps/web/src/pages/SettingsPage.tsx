import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AdminUidHint } from "../components/AdminUidHint";
import { IconBtn } from "../components/IconBtn";
import { useAuth } from "../context/AuthContext";
import { getOrg, updateOrg } from "../lib/db";

export function SettingsPage() {
  const { t } = useTranslation();
  const { orgId } = useParams();
  const { user, platformAdmin } = useAuth();
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [quota, setQuota] = useState<{ sites: number; pages: number; members: number } | null>(null);

  useEffect(() => {
    if (!orgId) return;
    void getOrg(orgId).then((o) => {
      if (!o) return;
      setName(o.name);
      setQuota({ sites: o.maxSites, pages: o.maxPagesPerSite, members: o.maxMembers });
    });
  }, [orgId]);

  async function onSave() {
    if (!orgId) return;
    await updateOrg(orgId, { name: name.trim() });
    setSaved(true);
  }

  return (
    <div className="page stack">
      <h1>{t("settings.title")}</h1>
      <div className="card stack">
        <label>
          {t("settings.orgName")}
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <IconBtn label={t("settings.save")} tone="accent" showLabel onClick={() => void onSave()} icon={<Save size={18} />} />
        {saved ? <p className="muted">{t("common.save")}</p> : null}
      </div>
      {quota ? (
        <p className="muted">
          {t("settings.entitlementsHint", {
            sites: quota.sites,
            pages: quota.pages.toLocaleString(),
            members: quota.members,
          })}
        </p>
      ) : null}
      {user && !platformAdmin ? <AdminUidHint uid={user.uid} /> : null}
      <p className="muted">{t("score.disclaimer")}</p>
    </div>
  );
}
