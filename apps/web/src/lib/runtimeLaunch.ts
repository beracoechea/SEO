/** Protocol registered by the current installer (HKCU). */
export const RUNTIME_START_PROTOCOL = "seo-monitor://start";

/** Handler left by installs from before the product rename. Silent compatibility only — not shown in the UI. */
export const LEGACY_START_PROTOCOL = "logicbus-seo://start";

/**
 * Secondary fallback path shown on the setup card.
 * Primary path is double-clicking Arrancar-motor-SEO.cmd on the Desktop.
 * Do not point at actualizar.ps1: older installs never copied that file.
 */
export const RUNTIME_START_COMMAND = "C:\\seo-runtime\\arrancar.cmd";

/**
 * Chrome can fire only one custom protocol per user gesture.
 * Installed PCs still have the legacy scheme (if they have any). New installs register both.
 */
export function startProtocolUrls(): string[] {
  return [LEGACY_START_PROTOCOL, RUNTIME_START_PROTOCOL];
}

export function preferredStartProtocol(): string {
  return startProtocolUrls()[0];
}

/**
 * Start C:\\seo-runtime from a real click (user gesture).
 * Uses location.href — Chrome allows that; iframes and synthetic a.click() do not.
 * Only the preferred (legacy) scheme is assigned: a second href would cancel the first.
 */
export function requestLocalRuntimeStart(
  loc: Pick<Location, "href"> | undefined = typeof window === "undefined" ? undefined : window.location,
) {
  if (!loc) return;
  try {
    loc.href = preferredStartProtocol();
  } catch {
    /* unregistered scheme */
  }
}

export async function copyRuntimeStartCommand(
  clipboard: Pick<Clipboard, "writeText"> | undefined = typeof navigator === "undefined" ? undefined : navigator.clipboard,
): Promise<boolean> {
  if (!clipboard?.writeText) return false;
  try {
    await clipboard.writeText(RUNTIME_START_COMMAND);
    return true;
  } catch {
    return false;
  }
}
