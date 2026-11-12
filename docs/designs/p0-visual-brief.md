# P0 visual brief — lobby wait lists + filters, table chat + reactions

Status: proposed · 2026-11-12 · iteration 2
Branch: `design/parity-loop-20261112`
Inputs: [p0-design-plan.md](p0-design-plan.md) §1–§2,
[replica-gap-analysis.md](replica-gap-analysis.md), [design-goal.md](design-goal.md),
`app/src/{styles,design-v2,responsive}.css`, `app/src/pages/{Lobby,TablePage}.tsx`.

This is the visual specification for the two design-visible P0 slices. It doesn't change
scope, server rules or slice order: those stay in the P0 plan. Documentation only; no app
code changes ship with this file.

## 0. How to read this brief

### Evidence tags

Every value carries one of three tags. A value with no tag is a mistake; report it.

| Tag | Meaning | Screenshot rule |
|---|---|---|
| **N** | Observed in the native client: pixel-sampled from a retained capture, or read from an installed file | Must match: flat fills exact hex, geometry ±1 px |
| **C** | Observed in the Codex clone only. Proves a behaviour is workable, says nothing about native | Not a parity claim |
| **A** | Assumption or DanGG design decision. Nothing native supports it | Must match this brief; the gap row stays open until a capture confirms or replaces it |

### Evidence used

Native captures live outside the repo at
`/Users/davidai/Documents/ChatGPT/REA/GGPoker/home-art/` (asset policy: not committed).

| ID | File | Size | Shows |
|---|---|---|---|
| N1 | `observed-holdem.png` | 1200 × 931 | Hold'em tab, **Group View** |
| N2 | `pair-select.png` (left pane, 34 px label strip on top) | 1200 × 957 | Hold'em tab, **Table View**, a full table selected |
| N3 | `observed-rush.png` | 1200 × 720 | Rush tab, pills, pool rows |
| N4 | `observed-plo.png` | 1200 × 838 | PLO tab, pills, game chips |
| N5 | `observed-tournaments.png` | 1200 × 720 | Tournament category pills, side-panel **Filter** |
| N6 | `rea/native-wait-list-strings.json` | — | Seven wait-list strings from the installed `string_table.json` |
| N7 | `rea/holdem-list-geometry.json` | — | Table View run boundaries and column widths |
| N8 | `rea/table-panels-verification.json` | — | Native chat is a **separate 300 × 767 window** beside an 850 × 615 table |
| N9 | `reaction-1.png … reaction-3.png` | 200 × 200 each | Shipped emoticon artwork: angry, listening, laughing |
| C1 | `local-detached-chat.png` | 300 × 736 | Codex chat window: log on top, composer and three reaction buttons below |
| C2 | Codex `FEATURES.md` chat/reaction entries | — | 280 chars, latest 50, 1 s sender limit, 4 s seat reaction |

Colours were sampled with a PNG decoder at 1× and are exact for flat fills. Text colours
are the brightest pixel of the glyph, so they can read slightly dark. Font sizes are
estimated by eye and tagged **A** until an overlay check confirms them.

### Corrections to the P0 plan found while writing this brief

| Plan says | Evidence says | Effect on this brief |
|---|---|---|
| Table View row shows **Join Wait List** instead of **Join** (§1) | N2: native Table View has **no action column**. The only action is the side-panel button, which reads **Open** even with a full table selected (Wait = 6) | The wait-list action goes in the side panel, not the row (§1.5). Table View keeps the eight native columns |
| Wait cell shows `-` when empty (§1) | N2: native shows **`0`**. `-` is used only for AvgPot / VPIP% / H/hr on an empty table | Wait renders `0` |
| Tournament filters are a **filter row** (§1, F3) | N5: native filters sit in a collapsible **Filter** section of the right panel, under the event summary. The row above the list holds category pills only | Filters go in the side panel (§1.7) |
| "Native table chat is unobserved" (§2) | N8: partly observed. The container is a separate 300 × 767 window. Its interior is still unobserved: no retained capture | Panel width is 300 px (§2.2). Capture C0 is still required for everything inside it |

---

## 1. Lobby wait lists and full filters

### 1.1 Observed native evidence

Coordinates are in the 1200-px-wide capture, measured from the window's top-left.

**Regions (N1, N2)**

| Region | x | Width | Notes |
|---|---|---|---|
| Main column | 8–840 | 833 | N7 `mainColumnWidth` |
| List (header + rows) | 20–829 | 810 | 12 px inset from the main column on the left |
| Side panel | 845–1085 | 240 | Fill `#1f1f1f`; player list rows on `#000000` |
| Account rail | 1090–1200 | 110 | Outside this slice |

Vertical stack: promo banner (140 px, N7), then an optional pill row, then the column
header, then rows.

**Shared list tokens (N1–N4)**

| Element | Value |
|---|---|
| List background | `#171717` |
| Column header | 24 px high, fill `#333333`, label `#7f7f7f` |
| Row fill | `#242424`; selected row `#3c1616` |
| Row gap | 4 px |
| Row accent | 4 px bar on the left edge (x 20–23), full row height |
| Header → first row gap | 4 px |
| Primary text (stakes, buy-in) | `#fdfdfd` |

**Group View rows (N1, N3, N4)**

| Element | Value |
|---|---|
| Row height / pitch | 60 px / 64 px |
| Join button | ≈ 120 × 40, x 695–814, vertically centred. Unselected: grey gradient `#47494c` → `#3d3f43`. Selected row: red gradient `#94262a` → `#762023`. Label `#fdfdfd` |
| Players pill | 80 × 36, fully rounded, 3 px outline `#373737`, no fill. Icon and number `#45fd00` |
| Promotion pill | ≈ 108 × 22, fill `#0f0f0f`, gold outline, label `#efb840` with a crown icon |
| Table Size chip | ≈ 52 × 20. **6-Max**: fill `#213321`, text `#11bf11`. **9-Max**: fill `#303321`, text `#a4bf09` |
| Games chip (Rush, PLO) | ≈ 60 × 19. Hold'em `#333814`, PLO `#26414f`, PLO-5 `#264845`, PLO-6 `#402444` |
| Row accent colour | Hold'em `#12c012`, PLO `#33bbff`, PLO-5 `#36d9ce`, PLO-6 `#5260ff` |
| Column label centres, Hold'em | Promotion 90 · Table Size 212 · Stakes 350 · Buy-in 496 · Players 620 · Action 756 |
| Column label centres, Rush | Promotion 87 · Games 191 · Stakes 304 · Buy-in 418 · Players 506 · Pros 590 · Hands/hr 662 · Action 764 |

The first row in each capture is the selected one. The red Join belongs to the
*selected* row, not to the highest stake.

**Table View rows (N2, N7)**

| Element | Value |
|---|---|
| Row height / pitch | 32 px / 36 px |
| Columns | Table Name · Stakes · Buy-in · Players · Wait · AvgPot · VPIP% · H/hr |
| Column boundaries (x) | 20, 196, 402, 512, 628, 680, 732, 784, 830 → widths 176, 206, 110, 116, 52, 52, 52, 46 |
| Table name | Muted gold, ≈ `#b57d41`, with a round badge to its left |
| Players cell | One pip per seat; filled pips are light, empty pips are dark |
| Wait cell | A number, including `0`, in muted gold ≈ `#ad9561` |
| Row action | None |

**Side panel (N1, N2)**

| Element | Value |
|---|---|
| View toggle | Two segments of 115 × 27 with a 2 px gap (x 849–963, 966–1080). On: `#a48954`, label white. Off: `#444444`, label `#989898` |
| Group View body | Leaderboard: Flag · Player · No. · Chips, white on black |
| Table View body | Felt preview with seated portraits, stacks, and a "Buy-in Range" caption |
| Primary button | ≈ 212 × 40. Group View: red **Join Table**. Table View: grey **Open** (`#3c3f43`) |
| Info link | `#058edc` with an (i) icon, below the button |

**Pill filters (N3, N4, N5)**

| Element | Value |
|---|---|
| Position | Between the banner and the column header, left-aligned at x 23 |
| Pill height | 21 px, fully rounded |
| Vertical rhythm | 9 px above, 7 px below |
| Gap between pills | 18 px |
| Width | Content plus ≈ 22 px side padding ("All" = 60, "Hold'em" = 93, "PLO" = 70) |
| Selected | Fill `#e6e6e6`, dark label |
| Unselected | Fill `#3e3e3e`, label ≈ `#b4b4b4` |
| Sets | Rush: All / Hold'em / PLO. PLO: All / PLO / PLO-5 / PLO-6. Hold'em: none |

**Tournaments (N5)**

- Category pills use the same pill style in one scrolling row, with a chevron at the right
  edge when they overflow.
- Rows are ≈ 25 px pitch on black. Status text is coloured: red "Late Reg. (mm:ss)", green
  "In 2 minute(s)".
- Side panel, top to bottom: search field ("Search tournaments and players"), event
  summary, a collapsible **Filter** header with a chevron, a **Reset** pill, a "Buy-in"
  label with an (i) icon, then a two-column grid of buttons: All, Custom, Low, Medium,
  High, Super. Each is ≈ 108 × 23 with a 4 px gap. Selected `#434447`; unselected
  `#2b2b2d`; panel `#1c1c1c`.
- Below: grey **Tournament Lobby** and red **Register**.

**Strings (N6)**, to be used byte-for-byte:

| Key | Text |
|---|---|
| `WaitingList` | Waiting List |
| `JoinWaitList` | Join Wait List |
| `PlayersOnWaitingList` | `{0}` Players on Waiting List (`{0}` in `#ffffff`) |
| `MobileWaitingFull` | Waiting list is currently full. |
| `YouCannotJoinWaitingList` | You cannot join waiting list |
| `LabelToJoinWaitingList` | To join waiting list, you must be playing in a table with the same conditions as below. |
| `LabelFailedJoin` | Failed to join waiting list because no tables were being played at. |

### 1.2 Not observed (assumptions follow in 1.3–1.9)

- Where **Join Wait List** appears, and where "N Players on Waiting List" is drawn.
- Any queued-state indicator, position readout or Leave control.
- The seat-offer dialog: layout, copy, countdown, expiry.
- Hover, pressed, focus and disabled states of every control. All captures are static.
- Pill and row transitions.
- Font family and sizes. The captures look like Roboto regular, not condensed.
- Tournament filter groups below Buy-in. They are below the fold in N5.
- A "full" Group View row. No capture shows a group with no free seat.

### 1.3 Colour tokens

New tokens, scoped to the lobby list (`.lobby-main`, `.lobby-side`). Don't redefine the
global `--bg` / `--panel` set: `design-v2.css` tints those green-black for the rest of the
app, and the native lobby is neutral grey.

| Token | Value | Tag | Use |
|---|---|---|---|
| `--lob-bg` | `#171717` | N | List background |
| `--lob-row` | `#242424` | N | Row |
| `--lob-row-selected` | `#3c1616` | N | Selected row |
| `--lob-row-hover` | `#2c2c2c` | A | Hover; already in `styles.css:231` |
| `--lob-head` | `#333333` | N | Column header fill |
| `--lob-head-text` | `#a0a0a0` | A | Header label; native is `#7f7f7f` (see 1.9) |
| `--lob-text` | `#fdfdfd` | N | Stakes, buy-in |
| `--lob-muted` | `#989898` | N | Secondary text |
| `--lob-count` | `#45fd00` | N | Players number |
| `--lob-outline` | `#373737` | N | Players pill outline |
| `--lob-wait` | `#ad9561` | N | Wait number, table name family |
| `--lob-side` | `#1f1f1f` | N | Side panel |
| `--lob-btn` | `#47494c` → `#3d3f43` | N | Neutral button gradient |
| `--lob-btn-red` | `#94262a` → `#762023` | N | Primary button gradient |
| `--lob-toggle-on` | `#a48954` | N | View toggle, selected |
| `--lob-toggle-off` | `#444444` | N | View toggle, unselected |
| `--lob-pill-on` / `-on-text` | `#e6e6e6` / `#171717` | N / A | Selected pill |
| `--lob-pill-off` / `-off-text` | `#3e3e3e` / `#b4b4b4` | N | Unselected pill |
| `--lob-link` | `#058edc` | N | Info links |
| `--lob-acc-holdem` / `-plo` / `-plo5` / `-plo6` | `#12c012` / `#33bbff` / `#36d9ce` / `#5260ff` | N | Row accents |
| `--lob-chip-6max` / text | `#213321` / `#11bf11` | N | Table Size chip |
| `--lob-chip-9max` / text | `#303321` / `#a4bf09` | N | Table Size chip |
| `--lob-queued` | `var(--gold)` | A | Everything that marks "you are queued" |
| `--lob-urgent` | `var(--red2)` | A | Ring and bar in the last 10 s of a seat offer (never text) |

### 1.4 Spacing and typography

**Spacing scale**: 4 · 8 · 12 · 16 · 20 · 24. The native list sits on the 4 px step (row
gap 4, accent 4, header 24, Table View row 32, Group View row 60). Use no other values in
these components.

**Typography.** Family is **N** by appearance only; sizes are **A**.

| Role | Family | Size / weight | Colour |
|---|---|---|---|
| Column header | `--head-font` (Roboto) | 12 / 400 | `--lob-head-text` |
| Group row: stakes, buy-in | Roboto | 15 / 400, tabular numerals | `--lob-text` |
| Group row: Join | Roboto | 18 / 500 | `#fdfdfd` |
| Group row: Join Wait List | Roboto | 14 / 500, one line | `#fdfdfd` |
| Players number | Roboto | 15 / 500, tabular | `--lob-count` |
| Chips (Table Size, Games) | Roboto | 12 / 500 | per chip |
| Table View row | Roboto | 13 / 400, tabular | per column |
| Pills | Roboto | 13 / 400 | per state |
| Side-panel button | Roboto | 18 / 500 | `#fdfdfd` |
| Wait-list line in side panel | Roboto | 12 / 400, count 12 / 700 | `--lob-muted`, count `#ffffff` |

The lobby list must not inherit `--ui-font` (Roboto Condensed). Condensed glyphs are the
largest visible difference from N1 today.

### 1.5 Layout and components

Every item in this section is **A** unless it restates a row from 1.1.

**Pill row.** Native geometry from 1.1. On tabs without native pills (Hold'em), the row
still renders, holding only the right-aligned controls below, so the header doesn't jump
between tabs.

**Filters button and popover** (DanGG extra, not native).
- Button: right end of the pill row, 21 px high, same shape as an unselected pill, label
  "Filters". When any extra filter is active it shows a count in `--lob-queued`
  ("Filters · 2").
- Popover: 280 px wide, anchored to the button's bottom-right with an 8 px offset. Fill
  `#1f1f1f`, 1 px border `#333333`, 8 px radius, 12 px padding, 12 px between groups.
- Contents, in order: Stakes, Seats, Speed (each a segmented row of pill buttons), search
  field (28 px), then checkboxes **Hide full**, **Has seats**, **★ Favorites**. Footer:
  **Reset** on the left, table count on the right.
- "+ Host" stays outside the popover, to the left of Filters.

**Group View row.** Native geometry. Action cell states:

| State | Button | Notes |
|---|---|---|
| Seats free | **Join**, neutral; red when the row is selected | N |
| Group full | **Join Wait List**, neutral; red when selected. Same 120 × 40 box | A |
| Queued | Outline button: 1 px `--lob-queued`, transparent fill, label "#2 · Leave" | A |
| Wait list full | Disabled neutral button "Join Wait List" at 45% opacity; reason in a tooltip and in `aria-describedby` | A |

The players pill doesn't change when a group is full. Group View has no Wait column (N1).

**Table View row.** Native geometry and the eight native columns. Changes from today:
- Wait renders the real queue length, `0` when empty.
- If the user is queued at that table, a 6 px `--lob-queued` dot sits 4 px left of the
  Wait number. There's no button in the row.
- The favourite star stays (DanGG extra) inside the Table Name cell and must not widen the
  column beyond 176 px.

**Side panel, Table View.** Stack under the felt preview, 8 px gaps, 8 px side padding:

1. Wait-list line: "**3** Players on Waiting List". Hidden when the count is 0.
2. If queued: "You are #2", in `--lob-queued`, 12 / 500.
3. Primary button, 40 px high, full width:
   - seats free → **Join** (red);
   - full, not queued → **Join Wait List** (red);
   - queued → **Leave Wait List** (neutral).
4. **Watch** (neutral, 32 px high).

**Header chip.** In `AppHeader`, left of the icon cluster.
- 24 px high pill, 1 px `--lob-queued` border, fill `rgba(231,182,75,.10)`, label
  "Waiting List · 2", 12 / 500. Hidden when the user has no queues.
- Popover: 300 px wide, same surface as the Filters popover. Title "Waiting List". One
  44 px row per queue: table or group name (13 / 500) over stakes and seats (11, muted);
  position "#3 of 5" right-aligned; **Leave** (28 px neutral button).
- Empty state can't occur, because the chip hides.

**Seat offer.**
- *In the lobby or on any non-table route*: modal, 360 px wide, existing `.modal` surface.
  Head "Seat available". Body: table name (15 / 700), stakes and seats (12, muted), and a
  44 px countdown ring with the seconds inside (15 / 700, tabular). Footer: **Pass**
  (neutral) and **Take seat** (red).
- *On a table route*: a non-modal toast in the existing toast stack, same copy and
  buttons, with a 3 px countdown bar along its bottom edge. It must not take focus (a
  player may be mid-decision).
- The countdown ring and bar are `--lob-queued` until 10 s remain, then `--lob-urgent`.
  The seconds stay white throughout: red text on this surface is only 3.2:1.
- Expiry: the offer closes, and a toast says "Seat offer expired".

**Errors.** Existing `.toast.error`, using the native strings in 1.1 unchanged.
`LabelToJoinWaitingList` is long: let it wrap to three lines at 360 px rather than
truncating.

### 1.6 Component states

| Component | Default | Hover | Pressed | Focus-visible | Selected | Disabled |
|---|---|---|---|---|---|---|
| Pill | `--lob-pill-off` | fill `#4a4a4a` | fill `#353535` | 2 px `#ffd98a` outline, 2 px offset | `--lob-pill-on` | 45% opacity |
| Group row | `--lob-row` | `--lob-row-hover` | — | outline as above, inset | `--lob-row-selected`, Join turns red | — |
| Table View row | `--lob-row` | `--lob-row-hover` | — | outline as above, inset | `--lob-row-selected` | — |
| Neutral button | `--lob-btn` | brightness 1.10 | translateY(1px) | outline as above | — | 45% opacity, no hover |
| Red button | `--lob-btn-red` | brightness 1.10 | translateY(1px) | outline as above | — | 45% opacity |
| Queued outline button | gold outline | fill `rgba(231,182,75,.12)` | fill `.20` | outline as above | — | — |
| View toggle segment | `--lob-toggle-off` | brightness 1.10 | — | outline as above | `--lob-toggle-on` | — |
| Header chip | as specified | fill `.18` | fill `.24` | outline as above | popover open: fill `.24` | — |

Other states to draw:
- **Loading**: 6 skeleton rows at row height, fill `#1e1e1e`, no shimmer.
- **Empty after filtering**: centred in the list, "No tables match these filters." with a
  **Reset filters** link in `--lob-link`.
- **Join pending**: the button label is replaced by a 16 px spinner; the width is held.

Only N: default and selected. Every hover, pressed, focus and disabled value is **A**.

### 1.7 Tournament categories and filters

- Category pills: same component as 1.5, one scrolling row, a 24 px chevron button at the
  right edge when the row overflows (N5).
- Filter section in the side panel, replacing the plan's filter row:
  - header "Filter" with a collapse chevron, expanded by default (N5);
  - **Reset** pill at the top right of the section (N5);
  - groups, each a label (12, muted) over a two-column grid of 23 px buttons with 4 px
    gaps: **Buy-in** All / Low / Medium / High / Super (N5; "Custom" is omitted until its
    behaviour is captured), then **Game**, **Status**, **Speed** (A, same grid);
  - **Registered only** as a checkbox row at the bottom (A).
- Selected filter button: fill `#434447`, white label. Unselected: `#2b2b2d`, label
  `--lob-muted`.
- The band boundaries for Low / Medium / High / Super are not evidenced. Label them DanGG
  values in code.

### 1.8 Motion

All **A**. Native motion is unobserved. Use `--ease` (`cubic-bezier(.2,.8,.2,1)`).

| Event | Animation | Duration |
|---|---|---|
| Pill select | Fill and label colour cross-fade | 120 ms |
| List after a filter change | Opacity 0 → 1, no movement, no per-row stagger | 120 ms |
| Row hover | Fill | 120 ms |
| Popover open / close | Opacity + 4 px rise / opacity only | 160 ms / 120 ms |
| Join → queued | Label cross-fade, width held | 160 ms |
| Wait number change | Number swaps; one 300 ms gold flash on the cell | 300 ms |
| Header chip appear | Opacity + scale .96 → 1 | 180 ms |
| Seat-offer modal | Existing `modalIn` | 220 ms |
| Countdown | Linear sweep, 30 s; the number updates once per second | 30 s |
| Last 10 s | Ring colour change to `--lob-urgent`; no blink | 200 ms |

Remove the existing per-row entrance stagger (`design-v2.css:152–156`) from this list. It
replays on every filter change and makes the list look slow.

Under `prefers-reduced-motion: reduce`: opacity only, at most 100 ms; no scale, rise or
flash; the countdown shows the number without the sweeping ring.

### 1.9 Accessibility

**Structure**
- Pills: `role="radiogroup"` with a label ("Game filter"); each pill `role="radio"` with
  `aria-checked`. Left/Right arrows move and select; one tab stop.
- View toggle: the same radiogroup pattern.
- List: `role="grid"` semantics or a real `<table>`. Header cells are sortable buttons with
  `aria-sort`. A row is one tab stop; Up/Down moves; Enter runs the primary action.
- Filters and Waiting List popovers: the trigger has `aria-expanded` and `aria-controls`.
  Focus moves into the popover on open; Esc closes it and returns focus to the trigger.
- Seat-offer modal: `role="alertdialog"`, labelled by its title, focus trapped, initial
  focus on **Take seat**. The toast variant uses `role="status"` with
  `aria-live="assertive"` and never moves focus.
- Countdown: announce at 30, 10 and 5 seconds, not every second.
- Queue changes ("You are now #1 on the waiting list for *Table*") go through one polite
  live region.

**Targets.** Native pills are 21 px tall, under the WCAG 2.2 minimum of 24 × 24. Keep the
21 px visual and extend the hit area to 28 px with padding or a pseudo-element. Every
button in a popover is at least 28 px high.

**Colour is never the only signal.** Queued state has a "#n" label as well as gold. The
urgent countdown has a number as well as a red ring. Chips carry their text.

**Contrast.** Three native values fail WCAG AA (4.5:1) for small text. DanGG deviates, and
the screenshot review accepts these three differences:

| Element | Native | Ratio | DanGG | Ratio |
|---|---|---|---|---|
| Column header label on `#333333` | `#7f7f7f` | 3.2:1 | `#a0a0a0` | 4.8:1 |
| View toggle, unselected label on `#444444` | `#989898` | 3.4:1 | `#c0c0c0` | 5.4:1 |
| View toggle, selected label on `#a48954` | `#ffffff` | 3.3:1 | `#1a1408` | 5.5:1 |

David can overrule these in favour of strict parity; nothing else depends on them.

### 1.10 Screenshot acceptance checklist

Viewport 1200 × 957, default theme, demo account, per the plan's capture protocol. Files
go to `docs/designs/evidence/waitlist/` and `…/filters/` as `<state>-dangg.png`.

Native-comparable (pair against the capture named):

- [ ] `holdem-group-view` ↔ N1: ≥ 6 rows; row 60 px, pitch 64; header 24 px `#333333`;
      list x 20–829; fills `#242424` / `#3c1616` exact.
- [ ] Same shot: Join box 120 × 40 at x 695–814; red only on the selected row.
- [ ] Same shot: players pill 80 × 36 with `#45fd00` number; 6-Max and 9-Max chips match
      the 1.1 fills.
- [ ] Same shot: no Roboto Condensed in the list.
- [ ] `holdem-table-view` ↔ N2: row 32 px, pitch 36; column boundaries within ±1 px of
      20, 196, 402, 512, 628, 680, 732, 784, 830; no row action.
- [ ] Same shot: Wait shows `0` for empty queues, never `-`.
- [ ] `rush-pills-all`, `rush-pills-holdem`, `rush-pills-plo` ↔ N3: pill height 21, first
      pill at x 23, gaps 18, selected `#e6e6e6`, unselected `#3e3e3e`.
- [ ] `plo-pills-all`, `-plo`, `-plo5`, `-plo6` ↔ N4: accents and game chips match 1.1.
- [ ] `tournaments-filters` ↔ N5: category pills above the list; Filter section in the
      side panel with Reset and the Buy-in grid.
- [ ] View toggle: segments 115 × 27, `#a48954` / `#444444`.

DanGG-only (must match this brief; no native pair exists):

- [ ] `holdem-table-view-full`: full table selected, Wait = 3, side panel "**3** Players on
      Waiting List" with a white count, red **Join Wait List**.
- [ ] `waitlist-queued-row`: gold dot beside Wait; side panel "You are #2" and **Leave Wait
      List**.
- [ ] `holdem-group-view-full`: a full group shows **Join Wait List** in the 120 × 40 box
      on one line.
- [ ] `waitlist-chip-popover`: header chip "Waiting List · 2", popover with two rows,
      position and **Leave**.
- [ ] `seat-offer-lobby`: modal with ring at 0:24 in gold.
- [ ] `seat-offer-urgent`: the same modal at 0:08, ring red, seconds white.
- [ ] `seat-offer-table`: toast variant over a table; focus stays where it was.
- [ ] `waitlist-error-full`, `-not-eligible`, `-no-tables`: each toast shows its native
      string unbroken and untruncated.
- [ ] `filters-popover`: open, two filters active, button reads "Filters · 2".
- [ ] `filters-empty`: empty state with **Reset filters**.
- [ ] `focus-pill`, `focus-row`, `focus-join`: 2 px `#ffd98a` outline visible.
- [ ] `reduced-motion`: screen recording of a filter change and a seat offer with the OS
      setting on; no movement, countdown is a number.

Record in `evidence.json` for each: SHA-256, viewport, and the three accepted contrast
deviations from 1.9.

---

## 2. Table chat and reactions

### 2.1 Observed native evidence

| Fact | Source | Tag |
|---|---|---|
| Native table chat opens as a **separate window, 300 × 767**, next to an 850 × 615 table window. Closing it leaves the table size unchanged | N8 (read-only spectator on an NLH table) | N |
| The installed client ships three static emoticons at 200 × 200: angry (1), listening (2), laughing (3). Yellow glossy faces on transparent backgrounds | N9 | N |
| A chat icon sits in the lobby title bar (39 × 38 button). `observed-chat.png` is the AskGG assistant, not table chat | `layout.json`, plan §0 | N |

Clone evidence, not native:

| Fact | Source | Tag |
|---|---|---|
| 300 px column: message log on top, composer at the bottom with a "Message" label, an input, a red **Send**, and three ≈ 46 × 46 reaction buttons | C1 | C |
| Lines render "Name: text" in one colour on a dark `#212121`-like surface | C1 | C |
| 280 characters, latest 50 lines, 1 s per-sender limit, text-only rendering | C2 | C |
| Reaction artwork beside the sender's seat for 4 s. Codex itself records this as "local behavior, not verified native timing" | C2 | C |

### 2.2 Not observed (assumptions follow in 2.3–2.9)

- The inside of the native chat window: header, tabs, line format, timestamps, name
  colours, dealer lines, composer, scrollbar.
- The native reaction menu: layout, count, whether reactions are animated.
- Where and how long a native reaction or chat bubble shows at a seat.
- Whether observers can type.
- Unread indication, mute and report affordances.
- All motion.

**Decision needed from David (A).** Native chat is a separate window. This brief specifies
a **docked panel at the native 300 px width**, because DanGG also ships as a browser page
and a PWA, where pop-out windows are unreliable. A pop-out for the Electron build can
follow as P1 once capture C0 shows the window's interior. If strict parity matters more
than web behaviour, say so before C3 starts.

### 2.3 Colour tokens

Scoped to the table page. All **A** except where noted.

| Token | Value | Use |
|---|---|---|
| `--chat-bg` | `rgba(31,31,31,.96)` | Panel surface (`#1f1f1f` is the native side-panel grey, N) |
| `--chat-composer` | `#2b2b2d` | Composer strip |
| `--chat-border` | `#333333` | Panel border, dividers |
| `--chat-text` | `#d6d6d6` | Message text |
| `--chat-name-self` | `#ffd98a` | Own name (current `.chat-log b` colour) |
| `--chat-name-other` | `#fdfdfd` | Other players' names |
| `--chat-system` | `#989898` | Dealer and system lines |
| `--chat-input` | `#101010` | Input fill |
| `--chat-unread` | `var(--red2)` | Unread badge fill |
| `--chat-danger-text` | `#ff98a0` | Warning text: counter near the limit, send errors (current `.tag.red` text colour) |
| `--chat-bubble` / `-text` | `#f2f2f2` / `#151515` | Seat bubble (current values) |
| `--chat-focus` | `#ffd98a` | Focus outline |

### 2.4 Layout regions and dimensions

All **A** except the 300 px width (N). Positions are relative to the table stage. The
bottom anchor is the top of the action bar plus 12 px (118 px from the stage bottom
today, `styles.css:535`).

**Launchers.** Two buttons, bottom-left of the felt.

| Element | Value |
|---|---|
| Chat launcher | 36 × 36, 8 px radius, at left 12 / bottom 118. Fill `rgba(16,16,16,.85)`, 1 px `--chat-border` |
| Reaction launcher | Same box, 8 px to the right |
| Unread badge | Min 16 × 16, fully rounded, `--chat-unread`, white 10 / 700; offset −4 / −4 from the launcher's top-right; shows "9+" above 9 |

Replace the "💬 Chat" and "😀" buttons in the top toolbar (`TablePage.tsx:823–824`).
Launchers use SVG icons, not emoji.

**Panel.** Opens above the launchers.

| Region | Value |
|---|---|
| Panel | 300 wide; height `min(420px, stage height − 190px)`; left 12, bottom 162; 8 px radius; 1 px `--chat-border`; `--chat-bg`; shadow `0 12px 30px rgba(0,0,0,.5)` |
| Header | 32 px. "Chat" (13 / 700) at left 10; Chat / Dealer segmented toggle (two 20 px segments, only if C4 ships); close button 24 × 24 at right 4 |
| Log | Fills the rest. Padding 8 / 10. Line gap 4. Scrolls vertically, thin scrollbar |
| "New messages" pill | Shown when scrolled up and a line arrives. 22 px high, centred, 8 px above the composer |
| Composer | 48 px strip, `--chat-composer`, top border. Input 32 px high, 6 px radius, `--chat-input`; **Send** 56 × 32 red, 6 px to its right; 8 px padding all round |
| Counter | Inside the input's right edge, 11 px. Hidden until 40 characters remain |

**Message line.** "**Name:** text", wrapping with `overflow-wrap: anywhere`. No avatars
and no timestamps until C0 shows them.

| Kind | Rendering |
|---|---|
| Other player | Name `--chat-name-other` 700, text `--chat-text` |
| Self | Name `--chat-name-self` 700, text `--chat-text` |
| Reaction | Name as above, then a 16 px inline artwork thumbnail and the label ("Laughing") |
| Dealer / system | Whole line `--chat-system`, italic, no name |
| Muted sender | Not rendered |

**Line actions.** On hover or focus a 20 × 20 "more" button appears at the line's right
edge and opens a two-item menu: **Mute player**, **Report**. Own lines and system lines
have no menu.

**Reaction picker.** Popover above the reaction launcher, 8 px offset.

| Element | Value |
|---|---|
| Cell | 56 × 56 button, 8 px radius, 44 × 44 artwork centred |
| Grid | 6 px gap, 8 px padding. Three reactions → one row, 196 px wide. More than four → four columns |
| Surface | Same as the panel |
| Artwork missing | A 56 × 32 chip with the label in 11 / 600. Never an emoji |

**Seat reaction.**

| Element | Value |
|---|---|
| Size | 64 × 64 at table scale 1, scaling with the felt |
| Anchor | Top-right of the avatar (70 × 70, `design-v2.css:321`): offset +40 px right, −28 px up. Mirrored to the top-left for seats in the right half of the felt, so it never clips at the stage edge |
| Must not cover | The seat's own hole cards, stack plate, bet chips, or the dealer button |
| Layering | Above seats, below the win overlay and modals |

**Seat chat bubble.** Unchanged from today: max-width 170, 12 / 1.3, 8 px radius, tail
below, 52 px above the seat. Cap it at three lines with an ellipsis; the full text is in
the log. If a bubble and a reaction land on the same seat, the reaction keeps its anchor
and the bubble stays centred above.

**Narrow screens (≤ 760 px).** The panel becomes a full-width bottom sheet (existing rule,
`responsive.css:260`), max 60% of the stage height. The picker centres above the
launchers.

### 2.5 Spacing and typography

Spacing scale: 4 · 6 · 8 · 10 · 12. The 6 and 10 steps exist only inside the chat panel,
where the current styles already use them.

| Role | Family | Size / weight / line height |
|---|---|---|
| Panel title | `--head-font` | 13 / 700 |
| Message | `--head-font` (Roboto, not condensed) | 13 / 400 / 1.35 |
| Sender name | same | 13 / 700 |
| Dealer line | same | 12 / 400 italic / 1.35 |
| Input | same | 13 / 400. On touch devices 16, to stop iOS zooming |
| Counter, badge | same | 11 / 500 and 10 / 700, tabular |
| Send | same | 13 / 600 |
| Picker fallback chip | same | 11 / 600 |
| Seat bubble | same | 12 / 400 / 1.3 |

All **A**. Today's log is 12 px (`styles.css:536`); 13 px matches the Codex window (C1) at
the same 300 px width.

### 2.6 Component states

| Component | States |
|---|---|
| Chat launcher | default · hover (brightness 1.15) · focus-visible (2 px `--chat-focus`) · open (1 px gold border) · unread (badge) |
| Reaction launcher | default · hover · focus-visible · open · **cooldown** (45% opacity for 1 s after a send) · disabled for observers and muted users |
| Panel | closed · open pinned to bottom · open scrolled up (shows "New messages") · empty ("No messages yet") · history loading (three skeleton lines) |
| Input | empty (placeholder "Type a message") · typing · ≤ 40 left (counter in `--chat-system`) · ≤ 10 left (counter in `--chat-danger-text`) · at limit (input stops at 280) · disabled |
| Send | disabled when empty · enabled · cooldown 1 s · error (see below) |
| Line | default · hover/focus (menu button visible) · menu open |
| Picker cell | default · hover (fill `rgba(255,255,255,.08)`) · focus-visible · pressed (scale .96) |
| Seat reaction | entering · holding · leaving |

Disabled-input placeholders (DanGG copy, A):
- observer: "Observers can't chat at this table";
- account or table mute: "You are muted at this table";
- Rush: chat is unavailable, so the launchers are hidden.

Send errors appear as one line above the composer for 2 s, in `--chat-danger-text`, 11 px: "Slow down"
(rate limit) or "Message not sent" (rejected).

Unread rules:
- The badge counts player lines and reactions received while the panel is closed. Dealer
  lines don't count.
- Opening the panel clears it.
- Own messages never count.

Settings → Table gets "Show chat bubbles" and "Show reactions" (both on by default). With
"Show reactions" off, reactions still appear as log lines.

### 2.7 Motion and timing

| Event | Animation | Duration | Tag |
|---|---|---|---|
| Seat reaction, total on screen | — | **4000 ms** | C |
| Seat reaction in | Opacity 0 → 1, scale .6 → 1.08 → 1 | 180 ms | A |
| Seat reaction out | Opacity 1 → 0, scale 1 → .9 | 240 ms | A |
| Seat chat bubble, total | Existing `chatPop` | **4500 ms** | A (current) |
| Panel open / close | Opacity + 6 px rise / opacity only | 160 ms / 120 ms | A |
| Picker open / close | Opacity + scale .96 → 1 / opacity | 140 ms / 100 ms | A |
| New line | Opacity 0 → 1, no slide | 120 ms | A |
| Auto-scroll when pinned | Instant, not smooth | 0 | A |
| Unread badge | One scale pulse 1 → 1.2 → 1 on each increment | 300 ms | A |
| Send cooldown | Opacity only | 1000 ms | C |

Rules:
- A newer reaction from the same player replaces the current one and restarts its 4 s.
- Reactions from different players show at the same time.
- No reaction or chat animation may run on the felt layer that holds pot, win or card
  animations. They sit in their own layer, so a reaction during a pot award leaves the win
  overlay's DOM node untouched (plan §2 acceptance).
- The existing emoji `emotePop` (2.3 s, 34 px text) is retired with the emoji tray.
- Sound: the existing `bubble` cue at volume .45 plays for the sender only. Incoming chat
  and reactions are silent.

Under `prefers-reduced-motion: reduce`: no scale or rise anywhere; reactions and bubbles
fade in and out over 100 ms and keep their full hold time; no badge pulse.

### 2.8 Accessibility

**Structure**
- Chat launcher: a `<button>` with `aria-expanded`, `aria-controls`, and a label that
  includes the count ("Chat, 2 unread").
- Panel: `role="region"` labelled "Table chat". It is not a dialog and never traps focus.
- Log: `role="log"`, `aria-live="polite"`, `aria-relevant="additions"`. Dealer lines are
  excluded from announcements (`aria-hidden` on the line, or a separate non-live list),
  because one per hand would drown out everything else.
- Reactions announce as text: "Nano reacted: Laughing". Artwork in the log has that text
  as `alt`. Seat artwork and seat bubbles are `aria-hidden`; the log already carries them.
- Picker: `role="menu"` with `role="menuitem"` cells, each labelled by the reaction name.
  Arrow keys move; Enter or Space sends and closes; Esc closes and returns focus to the
  launcher.
- Line menu: reachable by keyboard. The log is one tab stop with a roving focus; Up/Down
  moves between lines; Enter opens the line's menu.
- Input: a visible or `aria-label` label "Message", `maxlength="280"`. The counter is
  linked with `aria-describedby` and announces politely once at 40 and once at 10.
- Disabled input: the reason is the placeholder *and* an `aria-describedby` note.

**Focus must not move by itself.** Incoming lines, reactions, history load and unread
changes never move focus, never close the Enter-to-bet confirm dialog and never change a
typed bet. Opening the panel with the mouse doesn't focus the input; opening it with the
keyboard does.

**Keyboard.** Enter in the input sends and never bets (guard already exists near
`TablePage.tsx:601`). Esc in the input closes the panel and returns focus to the launcher.
No single-letter shortcut opens chat, to avoid collisions with remappable betting hotkeys.

**Targets.** Launchers 36 × 36, picker cells 56 × 56, Send 56 × 32, line menu button
20 × 20 visual with a 28 px hit area.

**Contrast** (computed against the solid base of each surface):

| Pair | Ratio |
|---|---|
| `--chat-text` on `#1f1f1f` | 11.3:1 |
| `--chat-system` on `#1f1f1f` | 5.7:1 |
| `--chat-system` on `--chat-composer` | 4.9:1 |
| `--chat-name-self` on `#1f1f1f` | 12.2:1 |
| Bubble text `#151515` on `#f2f2f2` | 16.3:1 |
| White on Send red (`#94262a`) | 8.2:1 |
| White on the unread badge (`--red2`) | 5.1:1 |

`--red2` itself is only 2.8–3.2:1 as text on these surfaces, so warning text uses
`--chat-danger-text` instead.

The panel is 96% opaque over a busy felt; keep the `backdrop-filter` blur so text contrast
doesn't depend on what's behind it.

**Text handling.** Messages render as text nodes only. Long unbroken strings wrap.
Right-to-left text gets `dir="auto"` per line.

### 2.9 Screenshot acceptance checklist

Viewport 1200 × 957, 6-max Hold'em, default theme. Files go to
`docs/designs/evidence/chat/` as `<state>-dangg.png`.

Native-comparable — **none yet**. Capture C0 has to produce the native side before any
row here can be called parity. Until then, check only:

- [ ] Panel width is exactly 300 px (N8).
- [ ] Reaction artwork is the three shipped images (N9), undistorted, at 44 px in the
      picker and 64 px at the seat.

DanGG-only (must match this brief):

- [ ] `chat-collapsed`: launchers at left 12 / bottom 118; badge "2" after two incoming
      lines; no emoji glyphs in the launchers.
- [ ] `chat-open-history`: a late joiner sees three earlier lines; self name gold, others
      white; panel 300 wide, composer 48 px.
- [ ] `chat-scrolled-up`: "New messages" pill visible; scroll position unchanged by the
      new line.
- [ ] `chat-counter`: 245 characters typed, counter shows 35; second shot at 272 shows 8
      in the warning colour.
- [ ] `chat-long-word`: a 120-character unbroken string wraps inside the panel with no
      horizontal scrollbar.
- [ ] `chat-markup-literal`: `<img src=x onerror=alert(1)>` appears as text.
- [ ] `chat-line-menu`: menu open on another player's line with **Mute player** and
      **Report**.
- [ ] `chat-dealer` (only if C4 ships): dealer lines grey italic; toggle on Dealer.
- [ ] `reaction-picker-open`: three 56 × 56 cells in one row above the launcher.
- [ ] `reaction-picker-fallback`: assets removed; three labelled chips, no emoji.
- [ ] `reaction-on-seat-left`, `reaction-on-seat-right`: 64 px artwork beside an opponent
      on each half of the felt; mirrored; cards, plate, bet chips and dealer button
      uncovered.
- [ ] `reaction-during-award`: reaction visible while a pot award animates; win overlay
      intact.
- [ ] `chat-bubble-on-seat`: bubble above the sender, at most three lines.
- [ ] `observer-chat`: input disabled with "Observers can't chat at this table"; reaction
      launcher disabled.
- [ ] `muted-chat`: input disabled with the muted copy.
- [ ] `chat-with-bet-draft`: a non-default bet amount typed and the confirm dialog open
      while a line and a reaction arrive; amount, focus ring and dialog unchanged.
- [ ] `focus-launcher`, `focus-picker-cell`, `focus-line`: 2 px `#ffd98a` outline.
- [ ] `chat-mobile` (390 × 844, non-blocking): bottom sheet, input at 16 px.
- [ ] `reduced-motion`: recording of a reaction and a bubble with the OS setting on; fades
      only, 4 s hold kept.
- [ ] Timing: a recording shows the seat reaction on screen for 4.0 s ± 0.1 s and the
      bubble for 4.5 s ± 0.1 s.

---

## 3. Open questions for David

1. **Chat container.** Docked 300 px panel (this brief) or a native-style separate window?
   See 2.2.
2. **Contrast deviations.** Accept the three lobby label colours in 1.9, or hold strict
   native values?
3. **Wait-list action in Table View.** Side panel only (this brief, following N2), or also
   a row button as the P0 plan first proposed?

## 4. What each capture would settle

| Capture (plan step) | Replaces these assumptions |
|---|---|
| W0: full table selected, Join Wait List flow, seat offer | 1.5 wait-list placement, queued state, seat-offer layout and timing; 1.2 "full group" row |
| W0 extra: hover and pressed frames of Join, pills, rows | 1.6 state values |
| N5 scrolled: the rest of the tournament Filter section | 1.7 groups below Buy-in, band names |
| C0: chat window interior, reaction menu, reaction on a seat, observer view | All of 2.3–2.7 except the 300 px width and the artwork |
| Overlay check of N1 / N2 at 1× | Font sizes in 1.4 |
