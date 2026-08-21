import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IconBtn } from "../components/IconBtn";
import { useAuth } from "../context/AuthContext";
import { createOrg, listAllOrgs, listSites, type Org } from "../lib/db";
import { isFirestoreNetworkError } from "../lib/firebase";

type Row = Org & { sites: number };

export function AdminDemosPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const orgs = (await listAllOrgs()).filter((o) => o.kind === "demo");
    const withCounts = await Promise.all(
      orgs.map(async (org) => ({ ...org, sites: (await listSites(org.id)).length })),
    );
    withCounts.sort((a, b) => a.name.localeCompare(b.name));
    setRows(withCounts);
  }

  useEffect(() => {
    void load().catch((e) => {
      setError(isFirestoreNetworkError(e) ? t("errors.firestoreNetwork") : t("errors.generic"));
    });
  }, [t]);

  async function onCreate() {
    if (!user?.email) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createOrg(user.uid, user.email, name, { kind: "demo" });
      navigate(`/admin/o/${id}`);
    } catch (e) {
      setError(isFirestoreNetworkError(e) ? t("errors.firestoreNetwork") : t("errors.generic"));
      setBusy(false);
    }
  }

  return (
    <div className="page page-wide stack">
      <div>
        <h1 style={{ margin: 0 }}>{t("admin.navDemos")}</h1>
        <p className="muted">{t("admin.demosHint")}</p>
      </div>
      {error ? <div className="banner warn">{error}</div> : null}

      <div className="card stack">
        <label>
          {t("admin.demoOrgName")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder={t("admin.demoOrgPlaceholder")}
          />
        </label>
        <IconBtn
          label={t("admin.demoCreate")}
          tone="accent"
          showLabel
          disabled={busy || name.trim().length < 2}
          onClick={() => void onCreate()}
          icon={<Plus size={18} />}
        />
      </div>

      {rows.length === 0 ? (
        <p className="muted">{t("admin.demosEmpty")}</p>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="site-table">
            <thead>
              <tr>
                <th>{t("admin.org")}</th>
                <th>{t("admin.sitesHaveAllowed")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="click-row" onClick={() => navigate(`/admin/o/${r.id}`)}>
                  <td>
                    <strong>{r.name}</strong>
                  </td>
                  <td>
                    {r.sites} / {r.maxSites}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
