# Transaction History 042 — reference port

Reference: `docs/screenshots/desk-pass/reference-042.jpg` (Paper screen 042).
Comparison: `docs/screenshots/desk-pass/compare-tx.png`.

## What changed

- The old admin-style table in the My Page “Transaction History” tab is replaced by the
  reference ledger: a **currency tab bar**, the five reference columns
  (Date & Time, Description, Amount, Available, Category), signed green/red amounts and
  a centred pager with 10 rows per page.
- Rows come from the existing `/api/cashier` ledger, sorted newest-first by `created_at`
  (not by row id, so seeded/back-dated entries sort correctly).
- Currency tabs map to the ledger's `currency` column: **Balance → USD, P$ → PLAY,
  T$ → TICKET, Gems → GEM**. The reference's separate “Ticket/Play Money” tabs collapse
  into T$/Gems because DanGG has no separate ticket or play-money wallet.
- Category labels translate ledger `kind` values (`cash_out → Cash-out`, `buy_in → Buy-in`,
  `bonus → Bonus`, …).

## Responsive

- ≥761: reference table with zebra rows and a fixed pager.
- ≤760: the table becomes a stacked ledger — timestamp line, description + signed amount,
  available and category underneath — so nothing scrolls sideways; pager buttons are 44 px.

## Verification

- Captures at 320/390/768/1200/1440/1920 (`docs/screenshots/tx-final`), 0 px overflow,
  five USD rows at every width. The dev database was seeded with representative ledger
  rows for the visual check; the component renders the real `/api/cashier` payload.
- 863 node tests, `tsc --noEmit`, Vite build: clean.
