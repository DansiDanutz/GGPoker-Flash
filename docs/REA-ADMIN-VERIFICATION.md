# REA runtime verification — admin console (2026-11-12)

REA (the MCP server from `morluto/rea`) was used for a runtime observation of the owner
console on the disposable test instance (`http://127.0.0.1:5197`). This complements the
static server inventory and the production SQLite inspection recorded in
[ARCHITECTURE.md](ARCHITECTURE.md#rea-inventory): it verifies the **running admin surface**
after the room-owner, recovery, snapshot and level-control changes, not source syntax.

## Setup

- Test server on 5197 (disposable `GGPOKER_DATA`), admin session pre-authenticated in a
  headless Chrome (157.0.8103.79) with a temporary profile and CDP on `127.0.0.1:9222`.
- The REA observation started **after** login, so no credentials, login response or token
  were captured. Storage values, request/response bodies and raw headers were not selected.
- Endpoint: `cdp_endpoint: http://127.0.0.1:9222`; target:
  `http://127.0.0.1:5197/#/admin`.

## Evidence

| Operation | Evidence | Result |
|---|---|---|
| `list_browser_targets` | `ev_9fbe9044…` | one page target, title `DanGG`, URL `…/#/admin` |
| `inspect_web_page` | `ev_a0af0030…` | 589 DOM nodes, accessibility tree, attach-window network/console metadata |
| `capture_web_screenshot` | `ev_0c342def…` | 756×469 PNG, SHA-256 `2904d1a6…` |

## Observed

- Platform heading and controls: **Refresh**, **Snapshot all**, **JSON**; the responsive
  admin layout rendered at 756×469.
- Accessibility text for the tournament rows included **Snapshot**, **Level +1**,
  **Recovery** values (`134 B`, `376 B`) and **restored** markers.
- Network during the 2 s window: `GET /api/admin/platform` → **200**, `GET /api/notifications`
  → 200; the admin page uses polling, no WebSocket connections were observed.
- Console events: **none** in the observation window (no errors/warnings logged).

## Limitations

- REA observes from attachment onward; earlier network/console activity (including the
  login) is unavailable. Page scripts were not captured and source maps were not fetched.
- Request/response bodies, raw headers, cookies, storage values and WebSocket payloads are
  not retained; the screenshot is viewport-only and REA does not scroll or evaluate JS.
- This is a test-instance observation with test data; it is not an authentication,
  authorization or security audit, and browser host platform/architecture were not
  observed. Evidence authority is `external-service`, confidence `observed`.

## Reproduce

1. Start a disposable server on 5197 and a headless Chrome with
   `--remote-debugging-port=9222 --user-data-dir=<temp>`.
2. Log in as a test admin (credentials stay in the local browser; do not pass them to REA).
3. Run `list_browser_targets`, then `inspect_web_page` and `capture_web_screenshot` from
   REA against the `#/admin` target.
