# Paid Spin ticket pool correction — issue #235

User-confirmed contract: exactly three paid entries; organizer selects 2%, 3%, 4% or 5%; only first place receives all entry Cash Chips minus one rake deduction. Wallets remain organizer-specific. Playing stacks never become a second payout. Play Money keeps its existing random prize model.

## Accounting and compatibility

Reuse the existing atomic round, seat-session, ticket and journal ledgers. New waiting rounds store a predetermined pooled outcome in the existing outcome JSON, with zero reserve. At commitment, exactly three funded seat sessions contribute their ticket value. First place receives the net pool once, second and third zero. Rake is burned once, retaining the existing organizer chip-consumption policy. Circulating chips plus burned chips must equal minted chips; the completed event escrow must be zero.

Persist rake and outcome before entries begin. Disallow changes while issued tickets, an active/disputed round, occupied/reserved seats, or open chip sessions exist. Existing legacy round outcomes/reserves retain their original validation and settlement. New rounds never request jackpot reserve funds. A recovered partially settled round retains its committed payout plan for admin resolution; unawarded rounds refund entries.

## Engine and UI

The paid outcome hook supplies the stored pooled plan; Play Money uses the existing random draw. Pooled games retain the existing two-minute blind progression (the 3x schedule), without representing the prize as a multiplier. Expose the payout model and rake terms in the game snapshot. Show ticket total, one-time rake and winner Cash Chip prize in setup and management; remove paid jackpot-wheel and reserve claims. Reuse existing controls and API routes, without a dependency or schema migration.

## Verification

Unit tests cover all four rake rates, rejection of invalid/mismatched terms, duplicate settlement, aborted/refunded games and legacy compatibility. A full three-human local WebSocket game uses transferred tickets, reconnects and verifies one winner journal, one rake journal, exactly three consumed tickets, empty escrow and supply reconciliation. Existing Play Money, cash-rake and Spin suites remain green. Type/build and browser checks validate UI. Fresh independent review checks the accounting and compatibility before PR readiness.

Production deployment requires a separate release approval. No historical payout is rewritten and no real customer funds are used by local tests.
