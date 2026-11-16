# Spin ticket pool verification

Contract: [spin-ticket-pool.md](spin-ticket-pool.md), confirmed directly by the user. Issue #235.

## Red / green

The updated three-player integration test first failed because the Spin rake route returned 404 (expected 200). Checkpoint `df9d988` records that reproducer. The same test passed after adding the route and pooled payout implementation. New ledger tests also initially failed on the absent pooled helper before it was implemented.

## Guarantees

| Check | Evidence |
| --- | --- |
| Four rake rates and exact conservation | `organizer-chip-spin.test.js` uses independent literal 2/3/4/5% expectations: 15,000 entries produce 14,700/14,550/14,400/14,250 prizes and 300/450/600/750 rake. |
| Once-only winner and rake | Ledger retries return unapplied; journal counts remain one. |
| Frozen terms, refunds and recovery | Reject mismatched outcomes, preserve legacy prizes, refund unawarded entries, retain partial awards in disputed recovery. |
| Real three-human paid game | `spin-manager.test.js`: transferred tickets, actual WebSocket actions, 14,550 winner + 450 rake at 3%, three ticket consumptions, empty pool, unchanged Play Money wallets, 100,000 total supply including burn, 99,550 circulating, rejoin does not change balances. |
| Engine model | `spin-table.test.js`: no paid random draw, immutable snapshot terms, two-minute blind progression. Existing Play Money tests remain unchanged. |
| Full regression | `node --test server/*.test.js`: 1,354 passed, zero failed/skipped. |
| Ledger coverage | `node --test --experimental-test-coverage --test-coverage-include=app/server/organizer-chip-spin.js --test-coverage-include=app/server/organizer-spin-prizes.js app/server/organizer-chip-spin.test.js`: 95.35% lines, 80% branches, 94.44% functions; pooled formula 100%. |
| Types/build | `npx --no-install tsc --noEmit -p tsconfig.json` and `npm run build` pass. Existing large-chunk warning remains. |

All tests use disposable local fixtures. No customer funds or live deployment were used. Browser/CI evidence is recorded with the final PR head separately. No lint script is configured; syntax, types and diff checks substitute for this repository.
