import { EventEmitter } from "node:events";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { isAllowedAppUrl, buildAppCsp, guardRedirects } = require("../electron/origin.cjs");

test("Electron navigation guard enforces exact origin and blocks prefix spoofing", () => {
  assert.equal(isAllowedAppUrl("https://dangg.live/", "https://dangg.live"), true);
  assert.equal(isAllowedAppUrl("https://dangg.live/#/table/holdem-1", "https://dangg.live"), true);
  assert.equal(isAllowedAppUrl("http://127.0.0.1:5198/index.html", "http://127.0.0.1:5198"), true);

  // Prefix spoofing attacks that previously bypassed url.startsWith(URL)
  assert.equal(isAllowedAppUrl("https://dangg.live.evil.com/", "https://dangg.live"), false);
  assert.equal(isAllowedAppUrl("http://127.0.0.1:51980/", "http://127.0.0.1:5198"), false);
  assert.equal(isAllowedAppUrl("http://dangg.live/", "https://dangg.live"), false);
  assert.equal(isAllowedAppUrl("javascript:alert(1)", "https://dangg.live"), false);
  assert.equal(isAllowedAppUrl("file:///etc/passwd", "http://127.0.0.1:5198"), false);
  assert.equal(isAllowedAppUrl("not-a-url", "https://dangg.live"), false);
});

test("Electron CSP includes object-src, base-uri and frame-ancestors hardening", () => {
  const csp = buildAppCsp("https://dangg.live", true);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /127\.0\.0\.1/);
});

test("Frontend TablePage key reset, stale WS guard, and WeakMap i18n tracking stay intact", () => {
  const appSrc = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const tableSrc = readFileSync(new URL("../src/pages/TablePage.tsx", import.meta.url), "utf8");
  const i18nSrc = readFileSync(new URL("../src/lib/i18n.tsx", import.meta.url), "utf8");
  assert.match(appSrc, /<TablePage key=\{parts\[1\]\} tableId=\{parts\[1\]\} \/>/);
  assert.match(tableSrc, /if \(wsRef\.current !== ws\) return;/);
  assert.match(i18nSrc, /new WeakMap<Text, string>\(\)/);
});

test("redirects stay on the configured desktop origin", () => {
  const contents = new EventEmitter();
  guardRedirects(contents, "http://localhost:5198");
  for (const [url, shouldCancel] of [["http://localhost:5198/lobby", false], ["http://localhost:5199/", true]]) {
    let cancelled = false;
    contents.emit("will-redirect", { url, preventDefault() { cancelled = true; } });
    assert.equal(cancelled, shouldCancel);
  }
});
