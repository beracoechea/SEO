import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { listAllUsers, type PlatformUser } from "../lib/db";

export function AdminUsersPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listAllUsers()
      .then(setUsers)
      .catch(() => setError(t("errors.generic")));
  }, [t]);

  return (
    <div className="page page-wide stack">
      <h1 style={{ margin: 0 }}>{t("admin.navUsers")}</h1>
      <p className="muted">{t("admin.usersHint")}</p>
      {error ? <div className="banner warn">{error}</div> : null}
      <div className="card" style={{ padding: 0 }}>
        <table className="site-table">
          <thead>
            <tr>
              <th>{t("team.email")}</th>
              <th>{t("admin.displayName")}</th>
              <th>{t("admin.orgs")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.uid}>
                <td>{u.email}</td>
                <td>{u.displayName || "—"}</td>
                <td>
                  {u.orgIds.length === 0 ? (
                    <span className="muted">—</span>
                  ) : (
                    u.orgIds.map((o, i) => (
                      <span key={o.id}>
                        {i > 0 ? ", " : null}
                        <Link to={`/admin/o/${o.id}`}>{o.name}</Link>
                      </span>
                    ))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
