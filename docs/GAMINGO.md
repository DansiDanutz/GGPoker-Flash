# Gamingo sandbox catalog

This integration lists assigned sandbox games for one active organizer. Set
GAMINGO_CATALOG_ORGANIZER_ID, GAMINGO_OPERATOR_ID, GAMINGO_KEY_ID and
GAMINGO_KEY_SECRET only in the server environment. Aggregator keys also require
GAMINGO_AGGREGATOR_ID. Never put credentials in the client build.

The catalog requires an authenticated session and a current organizer membership.
Only the matching user can trigger a signed GET to the supplier. The response must
identify a sandbox test operator. The browser receives IDs, titles and availability.
No launch, wallet operation, checkout or balance transfer is enabled.

For a read-only CLI check, also set GAMINGO_JURISDICTION and run
`node tools/gamingo-sandbox.mjs` from app/.
