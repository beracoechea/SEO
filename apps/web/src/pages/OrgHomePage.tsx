import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { listSites, type Site } from "../lib/db";

export function OrgHomePage() {
  const { t } = useTranslation();
  const { orgId } = useParams();
  const [sites, setSites] = useState<Site[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    void listSites(orgId)
      .then(setSites)
      .catch(() => setError(t("errors.generic")));
  }, [orgId, t]);

  return (
    <div className="page stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>{t("nav.sites")}</h1>
        <Link className="btn btn-primary" to={`/o/${orgId}/sites/new`}>
          {t("sites.add")}
        </Link>
      </div>
      {error ? <div className="banner warn">{error}</div> : null}
      {sites.length === 0 ? (
        <div className="card muted">{t("sites.empty")}</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="site-table">
            <thead>
              <tr>
                <th>{t("sites.name")}</th>
                <th>{t("sites.origin")}</th>
                <th>{t("sites.score")}</th>
                <th>{t("sites.lastCrawl")}</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/o/${orgId}/s/${s.id}`}>{s.name}</Link>
                  </td>
                  <td>
                    <a href={s.origin} target="_blank" rel="noreferrer">
                      {s.origin}
                    </a>
                  </td>
                  <td className="muted">—</td>
                  <td className="muted">{t("sites.never")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">{t("help.historyLivesOnRuntime")}</p>
    </div>
  );
}
