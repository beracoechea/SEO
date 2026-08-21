export function isAdminPath(pathname: string): boolean {
  return pathname.startsWith("/admin");
}

export function orgHomePath(orgId: string, admin: boolean): string {
  return admin ? `/admin/o/${orgId}` : `/o/${orgId}`;
}

export function sitePath(orgId: string, siteId: string, admin: boolean): string {
  return `${orgHomePath(orgId, admin)}/s/${siteId}`;
}

export function siteEditPath(orgId: string, siteId: string, admin: boolean): string {
  return `${sitePath(orgId, siteId, admin)}/edit`;
}

export function newSitePath(orgId: string, admin: boolean): string {
  return `${orgHomePath(orgId, admin)}/sites/new`;
}
