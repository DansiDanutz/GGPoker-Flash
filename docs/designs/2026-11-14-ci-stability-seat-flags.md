# CI stability + seat flags

## Flaky quick-fold test

`server/rush-quick-fold-ws.test.js` waited at most 20 s for the abandoned hand to be
written to `/api/hands`. Bots finish that hand on their own clock, and on a loaded CI
runner it sometimes exceeded 20 s, failing the required “Server tests” check (three
reruns across this project’s history). The test now:

- gives the hand up to **60 s** (120 × 500 ms polls) instead of 20 s,
- waits up to **60 s** for the initial quick-fold window instead of 40 s,
- keeps a 150 s test timeout to cover both.

No product behaviour changed; the assertions are identical.

Verified with three consecutive local runs of the file plus the full 864-test suite.

## Seat flags

Table seats now show a country flag next to the nickname, deterministically derived from
the nick (bots included), matching the reference table’s flag-on-every-seat look.
Rendered as a small inline span in the plate so existing truncation still works.

Evidence: `docs/screenshots/table-shots/1200-final.png`.
