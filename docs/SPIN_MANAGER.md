# Spin & Go Manager

Open Organiser → Create Spin & Go. Cash Chip setup costs $3 service credits; changing a future, unstarted, empty launch costs $1. Retries reuse the operation key. There is no hourly fee. Play Money testing stays free. Paid setup returns to Organiser management.

## Terms and funding
The existing engine supports exactly three seats, fixed 5,000/10,000 entries, and its existing random multipliers and blind rules. A launch time is the earliest permitted entry/start, not a promise to start with fewer than three players. Inspect the engine odds in the Spin lobby. Management does not allow changing odds or paying an unfunded jackpot.

Before entry, fund the full maximum prize reserve: 20,000 times the stake. That is 100,000,000 Cash Chips for a 5,000 entry, or 200,000,000 for a 10,000 entry. This is separate from the $3 setup fee and players' entries. Insufficient inventory blocks funding without minting chips. The organiser may cancel an empty waiting reserve. Once committed, finish the round or use existing audited recovery; cancellation is not available.

Exactly three funded seats commit one draw. Prizes follow that persisted outcome. When all three places are settled, any entry excess over prizes is burned and unused reserve returns to the organiser. A larger prize is funded from the reserve; no new chips are created. Management shows the latest round and its committed pool/prizes. Refresh to see changes made by players or the Cash Chips panel.

## Entry tickets
The organiser can buy prepaid tickets in Spin & Go Manager and transfer them in Cash Chips → Spin & Go entry tickets. Players with chips in that economy can also buy a ticket while spectating the table. New ticket sales require an active organiser membership; expiry never blocks refunds of existing tickets. Each ticket binds its owner economy, table and stake. Tickets do not reserve seats or guarantee a particular round or multiplier. Multiple unused tickets can fund later rounds on the same table.

Taking a seat automatically consumes the oldest matching issued ticket before using wallet chips. Otherwise the existing wallet buy-in applies. The buy-in dialog discloses ticket use and does not disable a funded ticket merely because the wallet is empty. Ticket funds move into the existing seat escrow in one database transaction. There is no intermediate spendable wallet credit. Failed seat placement or leaving before a round starts returns Cash Chips to the holder, not a second usable ticket.

Only the current holder can transfer or refund an unused ticket. Refunds return the exact price to that holder in the same organiser economy. A consumed ticket cannot be transferred/refunded again. Closing an empty table refunds all unused tickets to their current holders and any waiting reserve to the organiser. Service fees are not refunded. Closure rejects occupied tables, persisted open chip sessions, and committed/disputed rounds before touching live state.

## Validation and limits
Isolated integration tests cover invalid setup without charge, $3 setup/$1 reschedule replay, ticket issue/transfer/refund, insufficient funding, disputed/open-session closure refusal, duplicate joins, actual three-player completion, committed prizes, full supply conservation, and unused-ticket refunds on closure. Unit tests inject a seat-write failure to prove rollback, verify table/organiser/holder/key boundaries, and prove retries and prestart refunds cannot duplicate funds. Existing Spin tests exercise the maximum jackpot and recovery disputes without changing production RNG.

Chrome verification covers paid creation return, reserve explanation, ticket transfer/refund, table closure and 320/390/768/1024/1440 layouts. No live wagers or customer credits are used. No custom stakes, odds, multipliers, per-round rake controls or new recovery model are introduced.

TDD: new integration test first failed at the missing spin-tickets route (404). It passed after implementation. During test development, the runner was corrected not to wait for a nonexistent leave-table acknowledgement; a nested billing transaction found on closure was removed by keeping cash-only pause outside the Spin closure transaction.
