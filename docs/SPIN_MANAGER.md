# Spin & Go Manager

Open Organiser → Create Spin & Go. Cash Chip setup costs $3 service credits; changing a future, unstarted, empty launch costs $1. Retries reuse the operation key. There is no hourly fee. Play Money testing stays free. Paid setup returns to Organiser management.

## Terms and funding
Private Spin & Go tables are humans-only, including free Play Money trials. They wait for three human entries before drawing a prize or dealing. Public Play Money practice tables still fill empty seats with bots. Play Money entries debit the virtual wallet; organiser Cash Chip tickets remain exclusive to their organiser economy.

Paid games support exactly three seats and fixed 5,000/10,000 Cash Chip entries. The organiser selects 2%, 3%, 4% or 5% rake. The winner receives all three entries minus this one-time rake in that organiser's Cash Chip wallet; second and third receive zero. Playing stacks are separate from wallet prizes. For three 10,000-chip tickets at 5%, the winner receives 28,500 and 1,500 is rake.

Use **Open entries** before seating players. No jackpot reserve is required. The launch time is the earliest permitted start; all three funded seats are still required. Terms are frozen when a round opens. Rake changes require no active/disputed round, unused tickets, occupied/reserved seats or open chip sessions. Finish/cancel the round and refund unused tickets before changing terms.

Exactly three funded seat sessions commit the stored payout plan. The winner is credited once; when all places settle, rake leaves circulation once under the existing organiser chip policy. The completed prize escrow is zero and circulating chips plus burned chips reconcile to issued supply. No chips are minted for prizes. Pooled games use two-minute blind levels.

Play Money retains its random multipliers and existing blind rules. Historical reserved/committed paid rounds retain their original payout plan and recovery handling; this correction does not rewrite them.

## Entry tickets
The organiser can buy prepaid tickets in Spin & Go Manager and transfer them in Cash Chips → Spin & Go entry tickets. Players with chips in that economy can also buy a ticket while spectating the table. New ticket sales require an active organiser membership; expiry never blocks refunds of existing tickets. Each ticket binds its owner economy, table and stake. Tickets do not reserve seats or guarantee a particular round. Unused tickets lock the table rake until used or refunded. Multiple unused tickets can fund later rounds on the same table.

Taking a seat automatically consumes the oldest matching issued ticket before using wallet chips. Otherwise the existing wallet buy-in applies. The buy-in dialog discloses ticket use and does not disable a funded ticket merely because the wallet is empty. Ticket funds move into the existing seat escrow in one database transaction. There is no intermediate spendable wallet credit. Failed seat placement or leaving before a round starts returns Cash Chips to the holder, not a second usable ticket.

Only the current holder can transfer or refund an unused ticket. Refunds return the exact price to that holder in the same organiser economy. A consumed ticket cannot be transferred/refunded again. Closing an empty table refunds all unused tickets to their current holders. Legacy waiting reserves, if present, return to the organiser. Service fees are not refunded. Closure rejects occupied tables, persisted open chip sessions, and committed/disputed rounds before touching live state.

## Validation and limits
Isolated integration tests cover invalid setup without charge, $3 setup/$1 reschedule replay, ticket issue/transfer/refund, insufficient funding, disputed/open-session closure refusal, duplicate joins, actual three-player completion, committed prizes, full supply conservation, and unused-ticket refunds on closure. Unit tests inject a seat-write failure to prove rollback, verify table/organiser/holder/key boundaries, and prove retries and prestart refunds cannot duplicate funds. Pooled ledger tests cover all four rake rates, duplicate winner settlement, full refunds, partial-payment disputes and compatibility with legacy committed prizes. Play Money RNG remains unchanged.

Chrome verification covers paid creation return, pooled prize disclosure and rake controls, ticket transfer/refund, table closure and 320/390/768/1024/1440 layouts. No live wagers or customer credits are used. Custom stakes, paid random multipliers and a new recovery model are outside this correction.

TDD: new integration test first failed at the missing spin-tickets route (404). It passed after implementation. During test development, the runner was corrected not to wait for a nonexistent leave-table acknowledgement; a nested billing transaction found on closure was removed by keeping cash-only pause outside the Spin closure transaction.
