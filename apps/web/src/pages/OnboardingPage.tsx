import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import {
  createOrg,
  joinOrg,
  listMyOrgs,
  listPendingInvitesByEmail,
  type Invite,
} from "../lib/db";

export function OnboardingPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.email) return;
    void listPendingInvitesByEmail(user.email).then(setInvites).catch(() => setInvites([]));
  }, [user]);

  async function onCreate() {
    if (!user?.email) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createOrg(user.uid, user.email, name);
      navigate(`/o/${id}`, { replace: true });
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function onJoin(inv: Invite) {
    if (!user?.email) return;
    setBusy(true);
    try {
      await joinOrg(user.uid, user.email, inv);
      navigate(`/o/${inv.orgId}`, { replace: true });
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page stack">
      <h1>{t("onboarding.title")}</h1>
      {error ? <div className="banner warn">{error}</div> : null}
      <div className="card stack">
        <p className="muted">{t("onboarding.createHint")}</p>
        <label>
          {t("onboarding.orgName")}
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || name.trim().length < 2}
          onClick={() => void onCreate()}
        >
          {t("onboarding.create")}
        </button>
      </div>
      <div className="card stack">
        <h2 style={{ margin: 0, fontSize: 16 }}>{t("onboarding.invites")}</h2>
        {invites.length === 0 ? (
          <p className="muted">{t("onboarding.noInvites")}</p>
        ) : (
          invites.map((inv) => (
            <div key={inv.id} className="row" style={{ justifyContent: "space-between" }}>
              <span>
                {inv.orgName} · {inv.role}
              </span>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onJoin(inv)}>
                {t("onboarding.join")}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function OrgsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    void listMyOrgs(user.uid)
      .then((orgs) => {
        if (orgs.length === 0) navigate("/onboarding", { replace: true });
        else if (orgs.length === 1) navigate(`/o/${orgs[0].id}`, { replace: true });
        else setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user, navigate]);

  const [orgs, setOrgs] = useState<Awaited<ReturnType<typeof listMyOrgs>>>([]);

  useEffect(() => {
    if (!user) return;
    void listMyOrgs(user.uid).then(setOrgs);
  }, [user]);

  if (loading && orgs.length === 0) {
    return (
      <div className="page">
        <p className="muted">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="page stack">
      <h1>{t("orgs.title")}</h1>
      {orgs.length === 0 ? <p className="muted">{t("orgs.empty")}</p> : null}
      {orgs.map((o) => (
        <button key={o.id} type="button" className="card" style={{ cursor: "pointer", textAlign: "left" }} onClick={() => navigate(`/o/${o.id}`)}>
          <strong>{o.name}</strong>
          <div className="muted">{o.runtimeBaseUrl || "—"}</div>
        </button>
      ))}
    </div>
  );
}
