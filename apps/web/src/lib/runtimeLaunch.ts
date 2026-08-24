/** Custom protocol registered by the plant installer (HKCU, no admin). */
export const RUNTIME_START_PROTOCOL = "logicbus-seo://start";

/**
 * Ask Windows to run C:\\seo-runtime\\actualizar.ps1 -Mode Start.
 * Must be called from a click (user gesture) so the browser allows the protocol.
 */
export function requestLocalRuntimeStart(doc: Document | undefined = typeof document === "undefined" ? undefined : document) {
  if (!doc?.body) return;
  const a = doc.createElement("a");
  a.href = RUNTIME_START_PROTOCOL;
  a.style.display = "none";
  doc.body.appendChild(a);
  a.click();
  a.remove();
}
