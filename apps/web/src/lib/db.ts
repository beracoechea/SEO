import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDb } from "./firebase";

export type Role = "owner" | "member";
export type OrgStatus = "active" | "suspended";
export type MemberAccess = "active" | "revoked";

export const DEFAULT_MAX_SITES = 5;
export const DEFAULT_MAX_PAGES_PER_SITE = 20000;
export const DEFAULT_MAX_MEMBERS = 10;

export type Org = {
  id: string;
  name: string;
  createdByUid: string;
  runtimeBaseUrl: string | null;
  defaultRateLimit: number;
  status: OrgStatus;
  maxSites: number;
  maxPagesPerSite: number;
  maxMembers: number;
};

export type Site = {
  id: string;
  name: string;
  origin: string;
  active: boolean;
  maxPages: number;
  maxDepth: number;
  includePatterns: string[];
  excludePatterns: string[];
  templateUrls: string[];
};

export type Member = {
  uid: string;
  email: string;
  role: Role;
  access: MemberAccess;
};

export type Invite = {
  id: string;
  email: string;
  role: Role;
  orgId: string;
  orgName: string;
};

export type PlatformUser = {
  uid: string;
  email: string;
  displayName: string;
  orgIds: { id: string; name: string; role: Role }[];
};

function db() {
  return getDb();
}

function orgFromData(id: string, d: Record<string, unknown>): Org {
  const status = d.status === "suspended" ? "suspended" : "active";
  return {
    id,
    name: (d.name as string) ?? "",
    createdByUid: (d.createdByUid as string) ?? "",
    runtimeBaseUrl: (d.runtimeBaseUrl as string | null) ?? null,
    defaultRateLimit: (d.defaultRateLimit as number) ?? 4,
    status,
    maxSites: (d.maxSites as number) ?? DEFAULT_MAX_SITES,
    maxPagesPerSite: (d.maxPagesPerSite as number) ?? DEFAULT_MAX_PAGES_PER_SITE,
    maxMembers: (d.maxMembers as number) ?? DEFAULT_MAX_MEMBERS,
  };
}

export async function isPlatformAdminUid(uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db(), "platformAdmins", uid));
  return snap.exists();
}

export async function upsertUserProfile(uid: string, data: {
  email: string;
  displayName: string;
  photoUrl: string | null;
  locale: string;
}) {
  await setDoc(
    doc(db(), "users", uid),
    { ...data, email: data.email.trim().toLowerCase(), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function saveLocale(uid: string, locale: "es" | "en") {
  await setDoc(doc(db(), "users", uid), { locale }, { merge: true });
}

export async function listMyOrgs(uid: string): Promise<Org[]> {
  const snap = await getDocs(collection(db(), "users", uid, "orgIndex"));
  const orgs: Org[] = [];
  for (const row of snap.docs) {
    const orgSnap = await getDoc(doc(db(), "orgs", row.id));
    if (orgSnap.exists()) {
      orgs.push(orgFromData(orgSnap.id, orgSnap.data() as Record<string, unknown>));
    }
  }
  return orgs;
}

export async function createOrg(uid: string, email: string, name: string): Promise<string> {
  const orgRef = doc(collection(db(), "orgs"));
  const trimmed = name.trim();
  await setDoc(orgRef, {
    name: trimmed,
    createdByUid: uid,
    runtimeBaseUrl: null,
    defaultRateLimit: 4,
    status: "active",
    maxSites: DEFAULT_MAX_SITES,
    maxPagesPerSite: DEFAULT_MAX_PAGES_PER_SITE,
    maxMembers: DEFAULT_MAX_MEMBERS,
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db(), "orgs", orgRef.id, "members", uid), {
    role: "owner",
    email: email.trim().toLowerCase(),
    access: "active",
    joinedAt: serverTimestamp(),
  });
  await setDoc(doc(db(), "users", uid, "orgIndex", orgRef.id), {
    role: "owner",
    name: trimmed,
  });
  return orgRef.id;
}

export async function getOrg(orgId: string): Promise<Org | null> {
  const snap = await getDoc(doc(db(), "orgs", orgId));
  if (!snap.exists()) return null;
  return orgFromData(snap.id, snap.data() as Record<string, unknown>);
}

export async function updateOrg(
  orgId: string,
  patch: { name?: string; runtimeBaseUrl?: string | null; defaultRateLimit?: number },
) {
  await updateDoc(doc(db(), "orgs", orgId), patch);
}

export async function updateOrgEntitlements(
  orgId: string,
  patch: {
    status?: OrgStatus;
    maxSites?: number;
    maxPagesPerSite?: number;
    maxMembers?: number;
  },
) {
  await updateDoc(doc(db(), "orgs", orgId), patch);
}

function siteFromData(id: string, d: Record<string, unknown>): Site {
  return {
    id,
    name: (d.name as string) ?? "",
    origin: (d.origin as string) ?? "",
    active: Boolean(d.active ?? true),
    maxPages: (d.maxPages as number) ?? 20000,
    maxDepth: (d.maxDepth as number) ?? 8,
    includePatterns: (d.includePatterns as string[]) ?? [],
    excludePatterns: (d.excludePatterns as string[]) ?? [],
    templateUrls: (d.templateUrls as string[]) ?? [],
  };
}

export async function listSites(orgId: string): Promise<Site[]> {
  const snap = await getDocs(collection(db(), "orgs", orgId, "sites"));
  return snap.docs.map((s) => siteFromData(s.id, s.data() as Record<string, unknown>));
}

export async function getSite(orgId: string, siteId: string): Promise<Site | null> {
  const snap = await getDoc(doc(db(), "orgs", orgId, "sites", siteId));
  if (!snap.exists()) return null;
  return siteFromData(snap.id, snap.data() as Record<string, unknown>);
}

export async function createSite(
  orgId: string,
  input: {
    name: string;
    origin: string;
    maxPages: number;
    maxDepth: number;
    excludePatterns: string[];
    templateUrls: string[];
  },
) {
  const org = await getOrg(orgId);
  if (!org) throw new Error("org-missing");
  if (org.status === "suspended") throw new Error("org-suspended");
  const sites = await listSites(orgId);
  if (sites.length >= org.maxSites) throw new Error("sites-quota");
  const maxPages = Math.min(input.maxPages, org.maxPagesPerSite);
  await addDoc(collection(db(), "orgs", orgId, "sites"), {
    ...input,
    maxPages,
    active: true,
    includePatterns: [],
    createdAt: serverTimestamp(),
  });
}

export async function updateSiteMaxPages(orgId: string, siteId: string, maxPages: number) {
  const org = await getOrg(orgId);
  if (!org) throw new Error("org-missing");
  const capped = Math.max(1, Math.min(maxPages, org.maxPagesPerSite));
  await updateDoc(doc(db(), "orgs", orgId, "sites", siteId), { maxPages: capped });
}

export async function listMembers(
  orgId: string,
  opts?: { includeRevoked?: boolean },
): Promise<Member[]> {
  const snap = await getDocs(collection(db(), "orgs", orgId, "members"));
  const rows = snap.docs.map((s) => ({
    uid: s.id,
    email: s.data().email as string,
    role: s.data().role as Role,
    access: (s.data().access as MemberAccess) || "active",
  }));
  if (opts?.includeRevoked) return rows;
  return rows.filter((m) => m.access === "active");
}

export async function createInvite(orgId: string, email: string, role: Role, createdByUid: string) {
  await addDoc(collection(db(), "orgs", orgId, "invites"), {
    email: email.trim().toLowerCase(),
    role,
    createdByUid,
    createdAt: serverTimestamp(),
    consumedAt: null,
    orgName: (await getOrg(orgId))?.name ?? "",
  });
}

export async function listOrgInvites(orgId: string): Promise<Invite[]> {
  const snap = await getDocs(collection(db(), "orgs", orgId, "invites"));
  return snap.docs
    .filter((s) => !s.data().consumedAt)
    .map((s) => {
      const d = s.data();
      return {
        id: s.id,
        email: d.email as string,
        role: d.role as Role,
        orgId,
        orgName: (d.orgName as string) || orgId,
      };
    });
}

export async function listOpenInvitesForEmail(email: string, orgIds: string[]): Promise<Invite[]> {
  const out: Invite[] = [];
  const needle = email.trim().toLowerCase();
  for (const orgId of orgIds) {
    const snap = await getDocs(collection(db(), "orgs", orgId, "invites"));
    for (const s of snap.docs) {
      const d = s.data();
      if (d.consumedAt) continue;
      if ((d.email as string).toLowerCase() !== needle) continue;
      out.push({
        id: s.id,
        email: d.email as string,
        role: d.role as Role,
        orgId,
        orgName: (d.orgName as string) || orgId,
      });
    }
  }
  return out;
}

/** Invites for orgs we don't belong to yet — stored also under users pending via email lookup on known invites is limited.
 * v1: pending invites are listed from a top-level mail index created on invite.
 */
export async function listPendingInvitesByEmail(email: string): Promise<Invite[]> {
  const variants = Array.from(new Set([email.trim(), email.trim().toLowerCase()]));
  const out: Invite[] = [];
  const seen = new Set<string>();
  for (const needle of variants) {
    const q = query(collection(db(), "inviteIndex"), where("email", "==", needle));
    const snap = await getDocs(q);
    for (const s of snap.docs) {
      if (seen.has(s.id)) continue;
      const d = s.data();
      if (d.consumed) continue;
      seen.add(s.id);
      out.push({
        id: s.id,
        email: d.email as string,
        role: d.role as Role,
        orgId: d.orgId as string,
        orgName: d.orgName as string,
      });
    }
  }
  return out;
}

export async function addInviteIndex(invite: {
  orgId: string;
  orgName: string;
  email: string;
  role: Role;
}) {
  await addDoc(collection(db(), "inviteIndex"), {
    ...invite,
    email: invite.email.trim().toLowerCase(),
    consumed: false,
  });
}

export async function joinOrg(uid: string, email: string, invite: Invite) {
  await setDoc(doc(db(), "orgs", invite.orgId, "members", uid), {
    role: invite.role,
    email: email.trim().toLowerCase(),
    access: "active",
    joinedAt: serverTimestamp(),
  });
  await setDoc(doc(db(), "users", uid, "orgIndex", invite.orgId), {
    role: invite.role,
    name: invite.orgName,
  });
  await setDoc(doc(db(), "inviteIndex", invite.id), { consumed: true }, { merge: true });
}

export async function removeMember(orgId: string, uid: string) {
  await deleteDoc(doc(db(), "orgs", orgId, "members", uid));
  await deleteDoc(doc(db(), "users", uid, "orgIndex", orgId));
}

export async function revokeOrgAccess(orgId: string, uid: string) {
  await updateDoc(doc(db(), "orgs", orgId, "members", uid), {
    access: "revoked",
    revokedAt: serverTimestamp(),
  });
  await deleteDoc(doc(db(), "users", uid, "orgIndex", orgId));
}

export async function restoreOrgAccess(orgId: string, uid: string, role: Role, orgName: string) {
  await updateDoc(doc(db(), "orgs", orgId, "members", uid), {
    access: "active",
    role,
    revokedAt: null,
  });
  await setDoc(doc(db(), "users", uid, "orgIndex", orgId), {
    role,
    name: orgName,
  });
}

export async function findUserByEmail(email: string): Promise<{ uid: string; email: string; displayName: string } | null> {
  const needle = email.trim().toLowerCase();
  const q = query(collection(db(), "users"), where("email", "==", needle));
  const snap = await getDocs(q);
  const row = snap.docs[0];
  if (!row) return null;
  const d = row.data();
  return {
    uid: row.id,
    email: (d.email as string) ?? needle,
    displayName: (d.displayName as string) ?? "",
  };
}

export async function grantOrgAccess(input: {
  orgId: string;
  orgName: string;
  email: string;
  role: Role;
  grantedByUid: string;
}): Promise<"member" | "invite"> {
  const email = input.email.trim().toLowerCase();
  const existing = await findUserByEmail(email);
  if (existing) {
    const memberRef = doc(db(), "orgs", input.orgId, "members", existing.uid);
    const prev = await getDoc(memberRef);
    await setDoc(
      memberRef,
      {
        role: input.role,
        email,
        access: "active",
        grantedByUid: input.grantedByUid,
        joinedAt: prev.exists() ? (prev.data()?.joinedAt ?? serverTimestamp()) : serverTimestamp(),
        revokedAt: null,
      },
      { merge: true },
    );
    await setDoc(doc(db(), "users", existing.uid, "orgIndex", input.orgId), {
      role: input.role,
      name: input.orgName,
    });
    return "member";
  }
  await createInvite(input.orgId, email, input.role, input.grantedByUid);
  await addInviteIndex({
    orgId: input.orgId,
    orgName: input.orgName,
    email,
    role: input.role,
  });
  return "invite";
}

export async function listAllOrgs(): Promise<Org[]> {
  const snap = await getDocs(collection(db(), "orgs"));
  return snap.docs.map((s) => orgFromData(s.id, s.data() as Record<string, unknown>));
}

export async function listAllUsers(): Promise<PlatformUser[]> {
  const snap = await getDocs(collection(db(), "users"));
  const out: PlatformUser[] = [];
  for (const row of snap.docs) {
    const d = row.data();
    const idx = await getDocs(collection(db(), "users", row.id, "orgIndex"));
    out.push({
      uid: row.id,
      email: (d.email as string) ?? "",
      displayName: (d.displayName as string) ?? "",
      orgIds: idx.docs.map((o) => ({
        id: o.id,
        name: (o.data().name as string) || o.id,
        role: (o.data().role as Role) || "member",
      })),
    });
  }
  return out.sort((a, b) => a.email.localeCompare(b.email));
}

export { isPrivateOrigin } from "./origin";

export async function pingRuntime(baseUrl: string): Promise<boolean> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/health`;
  try {
    const res = await fetch(url, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}
