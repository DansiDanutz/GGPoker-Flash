// Strict origin comparison and CSP builder for Electron navigation and popup guards.
const { URL: NodeURL } = require("node:url");

/** True only when target parses as an http/https URL matching allowedUrl's exact origin. */
function isAllowedAppUrl(target, allowedUrl) {
  try {
    const a = new NodeURL(String(target || ""));
    const b = new NodeURL(String(allowedUrl || ""));
    if (a.protocol !== "http:" && a.protocol !== "https:") return false;
    return a.origin === b.origin;
  } catch {
    return false;
  }
}

function buildAppCsp(appUrl, isRemote) {
  const target = new NodeURL(appUrl);
  const wsOrigin = `${target.protocol === "https:" ? "wss:" : "ws:"}//${target.host}`;
  const connect = ["'self'", target.origin, wsOrigin];
  if (!isRemote) {
    connect.push("http://127.0.0.1:*", "ws://127.0.0.1:*", "http://localhost:*", "ws://localhost:*");
  }
  return `default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; child-src 'self' blob:; connect-src ${connect.join(" ")}; font-src 'self' data:;`;
}

function guardRedirects(contents, appUrl) {
  contents.on('will-redirect', (event) => {
    if (!isAllowedAppUrl(event.url, appUrl)) event.preventDefault();
  });
}

module.exports = { isAllowedAppUrl, buildAppCsp, guardRedirects };
