import { Building2, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IconBtn } from "../components/IconBtn";
import { useAuth } from "../context/AuthContext";
import {
  joinOrg,
  listMyOrgs,
  listPendingInvitesByEmail,
  type Invite,
} from "../lib/db";

export function OnboardingPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.email) return;
    void listPendingInvitesByEmail(user.email).then(setInvites).catch(() => setInvites([]));
  }, [user]);

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
        <p className="muted">{t("onboarding.waitHint")}</p>
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
              <IconBtn
                label={t("onboarding.join")}
                tone="accent"
                showLabel
                disabled={busy}
                onClick={() => void onJoin(inv)}
                icon={<UserPlus size={18} />}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function OrgsPage() {
  const { t } = useTranslation();
  const { user, platformAdmin } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    void listMyOrgs(user.uid)
      .then((orgs) => {
        if (orgs.length === 0) {
          if (platformAdmin) navigate("/admin", { replace: true });
          else navigate("/onboarding", { replace: true });
        } else if (orgs.length === 1 && !platformAdmin) navigate(`/o/${orgs[0].id}`, { replace: true });
        else setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user, navigate, platformAdmin]);

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
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>{t("orgs.title")}</h1>
        {platformAdmin ? (
          <IconBtn label={t("nav.admin")} tone="sky" showLabel onClick={() => navigate("/admin")} icon={<Building2 size={18} />} />
        ) : null}
      </div>
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
