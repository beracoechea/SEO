/** Custom protocol registered by the plant installer (HKCU, no admin). */
export const RUNTIME_START_PROTOCOL = "seo-monitor://start";

/**
 * Ask Windows to run C:\\seo-runtime\\arrancar.cmd (then actualizar.ps1 -Mode Start).
 * Prefer a real <a href> click; this is a fallback from a user-gesture handler.
 * Do not use location.assign: if the protocol is missing, Chrome navigates away from the app.
 */
export function requestLocalRuntimeStart(doc: Document | undefined = typeof document === "undefined" ? undefined : document) {
  if (!doc?.body) return;
  const iframe = doc.createElement("iframe");
  iframe.setAttribute("src", RUNTIME_START_PROTOCOL);
  iframe.setAttribute("style", "display:none;width:0;height:0;border:0");
  iframe.setAttribute("aria-hidden", "true");
  doc.body.appendChild(iframe);
  globalThis.setTimeout(() => iframe.remove(), 4000);
}
