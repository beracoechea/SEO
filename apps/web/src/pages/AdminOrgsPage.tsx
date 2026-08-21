import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { listAllOrgs, listMembers, listSites, type Org } from "../lib/db";

type Row = Org & { users: number; sites: number };

export function AdminOrgsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const orgs = await listAllOrgs();
        const withCounts = await Promise.all(
          orgs.map(async (org) => {
            const [members, sites] = await Promise.all([
              listMembers(org.id),
              listSites(org.id),
            ]);
            return { ...org, users: members.length, sites: sites.length };
          }),
        );
        withCounts.sort((a, b) => a.name.localeCompare(b.name));
        setRows(withCounts);
      } catch {
        setError(t("errors.generic"));
      }
    })();
  }, [t]);

  return (
    <div className="page page-wide stack">
      <div>
        <h1 style={{ margin: 0 }}>{t("admin.title")}</h1>
        <p className="muted">{t("admin.subtitle")}</p>
      </div>
      {error ? <div className="banner warn">{error}</div> : null}
      {rows.length === 0 && !error ? <p className="muted">{t("admin.orgsEmpty")}</p> : null}
      {rows.length > 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <table className="site-table">
            <thead>
              <tr>
                <th>{t("admin.org")}</th>
                <th>{t("admin.status")}</th>
                <th>{t("admin.usersHaveAllowed")}</th>
                <th>{t("admin.sitesHaveAllowed")}</th>
                <th>{t("admin.pagesAllowed")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="click-row"
                  onClick={() => navigate(`/admin/o/${r.id}`)}
                >
                  <td>
                    <strong>{r.name}</strong>
                  </td>
                  <td>
                    {r.status === "suspended" ? (
                      <span className="score-chip score-danger">{t("admin.suspended")}</span>
                    ) : (
                      <span className="score-chip score-ok">{t("admin.active")}</span>
                    )}
                  </td>
                  <td>
                    {r.users} / {r.maxMembers}
                  </td>
                  <td>
                    {r.sites} / {r.maxSites}
                  </td>
                  <td>{r.maxPagesPerSite.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
