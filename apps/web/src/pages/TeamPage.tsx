import { UserMinus, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IconBtn } from "../components/IconBtn";
import { useAuth } from "../context/AuthContext";
import {
  addInviteIndex,
  createInvite,
  getOrg,
  listMembers,
  removeMember,
  type Member,
  type Role,
} from "../lib/db";

export function TeamPage() {
  const { t } = useTranslation();
  const { orgId } = useParams();
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [maxMembers, setMaxMembers] = useState<number | null>(null);

  async function refresh() {
    if (!orgId) return;
    setMembers(await listMembers(orgId));
  }

  useEffect(() => {
    void refresh().catch(() => setError(t("errors.generic")));
  }, [orgId, t]);

  async function onInvite() {
    if (!orgId || !user || atSeatQuota) return;
    setBusy(true);
    setError(null);
    try {
      const org = await getOrg(orgId);
      await createInvite(orgId, email, role, user.uid);
      await addInviteIndex({
        orgId,
        orgName: org?.name ?? orgId,
        email: email.trim().toLowerCase(),
        role,
      });
      setEmail("");
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  const me = members.find((m) => m.uid === user?.uid);

  useEffect(() => {
    if (!orgId) return;
    void getOrg(orgId).then((o) => setMaxMembers(o?.maxMembers ?? null));
  }, [orgId]);

  const atSeatQuota = maxMembers != null && members.length >= maxMembers;

  return (
    <div className="page stack">
      <h1>{t("team.title")}</h1>
      <p className="muted">{t("team.mustUseGoogle")}</p>
      {maxMembers != null ? (
        <p className="muted">{t("team.quota", { have: members.length, allowed: maxMembers })}</p>
      ) : null}
      {atSeatQuota ? <div className="banner warn">{t("team.quotaReached")}</div> : null}
      {error ? <div className="banner warn">{error}</div> : null}
      <div className="card stack">
        <div className="row">
          <label style={{ flex: 1 }}>
            {t("team.email")}
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label style={{ width: 160 }}>
            {t("team.role")}
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="member">{t("team.member")}</option>
              <option value="owner">{t("team.owner")}</option>
            </select>
          </label>
          <IconBtn
            label={t("team.invite")}
            tone="accent"
            showLabel
            disabled={busy || atSeatQuota || !email.includes("@")}
            onClick={() => void onInvite()}
            icon={<UserPlus size={18} />}
          />
        </div>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table className="site-table">
          <thead>
            <tr>
              <th>{t("team.email")}</th>
              <th>{t("common.role")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.uid}>
                <td>{m.email}</td>
                <td>{m.role === "owner" ? t("team.owner") : t("team.member")}</td>
                <td>
                  {me?.role === "owner" && m.uid !== user?.uid ? (
                    <IconBtn
                      label={t("team.remove")}
                      tone="danger"
                      onClick={() => orgId && void removeMember(orgId, m.uid).then(refresh)}
                      icon={<UserMinus size={18} />}
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
