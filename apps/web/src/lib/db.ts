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

export type Org = {
  id: string;
  name: string;
  createdByUid: string;
  runtimeBaseUrl: string | null;
  defaultRateLimit: number;
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
};

export type Invite = {
  id: string;
  email: string;
  role: Role;
  orgId: string;
  orgName: string;
};

function db() {
  return getDb();
}

export async function upsertUserProfile(uid: string, data: {
  email: string;
  displayName: string;
  photoUrl: string | null;
  locale: string;
}) {
  await setDoc(
    doc(db(), "users", uid),
    { ...data, updatedAt: serverTimestamp() },
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
      const d = orgSnap.data();
      orgs.push({
        id: orgSnap.id,
        name: d.name as string,
        createdByUid: d.createdByUid as string,
        runtimeBaseUrl: (d.runtimeBaseUrl as string | null) ?? null,
        defaultRateLimit: (d.defaultRateLimit as number) ?? 4,
      });
    }
  }
  return orgs;
}

export async function createOrg(uid: string, email: string, name: string): Promise<string> {
  const orgRef = doc(collection(db(), "orgs"));
  await setDoc(orgRef, {
    name: name.trim(),
    createdByUid: uid,
    runtimeBaseUrl: null,
    defaultRateLimit: 4,
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db(), "orgs", orgRef.id, "members", uid), {
    role: "owner",
    email,
    joinedAt: serverTimestamp(),
  });
  await setDoc(doc(db(), "users", uid, "orgIndex", orgRef.id), {
    role: "owner",
    name: name.trim(),
  });
  return orgRef.id;
}

export async function getOrg(orgId: string): Promise<Org | null> {
  const snap = await getDoc(doc(db(), "orgs", orgId));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    id: snap.id,
    name: d.name as string,
    createdByUid: d.createdByUid as string,
    runtimeBaseUrl: (d.runtimeBaseUrl as string | null) ?? null,
    defaultRateLimit: (d.defaultRateLimit as number) ?? 4,
  };
}

export async function updateOrg(
  orgId: string,
  patch: { name?: string; runtimeBaseUrl?: string | null; defaultRateLimit?: number },
) {
  await updateDoc(doc(db(), "orgs", orgId), patch);
}

export async function listSites(orgId: string): Promise<Site[]> {
  const snap = await getDocs(collection(db(), "orgs", orgId, "sites"));
  return snap.docs.map((s) => {
    const d = s.data();
    return {
      id: s.id,
      name: d.name as string,
      origin: d.origin as string,
      active: Boolean(d.active ?? true),
      maxPages: (d.maxPages as number) ?? 20000,
      maxDepth: (d.maxDepth as number) ?? 8,
      includePatterns: (d.includePatterns as string[]) ?? [],
      excludePatterns: (d.excludePatterns as string[]) ?? [],
      templateUrls: (d.templateUrls as string[]) ?? [],
    };
  });
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
  await addDoc(collection(db(), "orgs", orgId, "sites"), {
    ...input,
    active: true,
    includePatterns: [],
    createdAt: serverTimestamp(),
  });
}

export async function listMembers(orgId: string): Promise<Member[]> {
  const snap = await getDocs(collection(db(), "orgs", orgId, "members"));
  return snap.docs.map((s) => ({
    uid: s.id,
    email: s.data().email as string,
    role: s.data().role as Role,
  }));
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
    email,
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

export function isPrivateOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local")) return true;
    if (host === "127.0.0.1" || host === "::1") return true;
    const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (a === 10) return true;
      if (a === 127) return true;
      if (a === 192 && b === 168) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
    }
    return false;
  } catch {
    return true;
  }
}

export async function pingRuntime(baseUrl: string): Promise<boolean> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/health`;
  try {
    const res = await fetch(url, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}
