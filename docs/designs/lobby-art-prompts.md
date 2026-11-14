# Steps 4–6: lobby home, tournaments, Hold'em and PLO cash (generate in ChatGPT)

On the phone, a player now lands on the **Poker game menu** after login (one row per game, as on
the GGPoker mobile lobby), and the Casino tab lists its games straight under the banner. Those menus
come first: prompts 4.0 and 4.0b.

What a player sees right after login (the desktop **Home** lobby), then **Tournaments**, then the
**Hold'em** and **PLO** cash lobbies. Today these use flat drawn tiles with the words baked into the
picture. The new art has **no words at all**: the page draws every title, label and button on top,
then adds live effects (sparks, shine, a slow push-in).

**Size for every prompt: landscape 1536×1024**, unless a prompt says otherwise. Paste each image into
the chat when it's ready. The order below is the order I'll wire them in.

Shared ending (paste at the end of every prompt):

> Saturated, vibrant, premium game-promo look, octane-style 3D render, rim light, volumetric light,
> glossy materials, shallow depth of field, ultra detailed. No text, no letters, no numbers, no
> logos, no watermark, no people.

## Reused from earlier steps (nothing to generate)

| Slot | Reuses |
| --- | --- |
| Home "For You": Daily Freebie | 3a ruby gift box |
| Home "For You": Ocean Rewards | 3e whale and gems |
| Home "For You": Live Series | the login golden trophy |
| Home "DanGG.TV" thumbnails ×4 | hero banners: Quick Flip, All-in or Fold, Fast Fold, PLO |

---

## Step 4: Home lobby (first screen after login)

### 4.0 Game menu icons (one image, six icons) → `menu-icons.png`

The phone Poker menu lists one row per game: a large icon on the left, then the name, the live
player count and a perk pill (the same layout as GGPoker's own lobby menu, where each row has a
glossy 3D object: a slot machine, a roulette wheel, a trophy). Ours are flat drawn badges today.
I cut the six icons out of one image and drop the background.

**Size: landscape 1536×1024.**

A sprite sheet of six glossy 3D game icons arranged in a neat 3 × 2 grid with even spacing, each
icon centred in its own cell on a plain flat pure-black background, all lit the same way from the
upper left, all the same size, each with a soft contact shadow under it. Row 1: a red and black
casino chip standing on its edge with a flaming lightning bolt across it (All-in or Fold); two
playing cards, an ace of spades and an ace of hearts, fanned with two gold chips at their base
(Hold'em); four sapphire playing cards fanned in a tight arc with a blue chip at their base (PLO).
Row 2: a short stack of six violet playing cards with a small gold crown on top (Short Deck); a
playing card speeding forward with cyan motion streaks behind it (Fast Fold); a golden prize wheel
with ruby and white segments and gold coins around its base (Jackpot SNG).

### 4.0b Casino menu icons (one image, eight icons) → `casino-icons.png`

The Casino tab uses the same row layout (icon on the left, then name, description and tags), as on
the GGPoker casino menu with its 3D slot machine, roulette wheel and trophy. Same treatment.

**Size: landscape 1536×1024.**

A sprite sheet of eight glossy 3D casino icons arranged in a neat 4 × 2 grid with even spacing, each
icon centred in its own cell on a plain flat pure-black background, all lit the same way from the
upper left, all the same size, each with a soft contact shadow under it. Row 1: a classic gold and
chrome slot machine with three red cherry reels and a red ball lever; a mahogany and gold roulette
wheel with two white dice bouncing beside it; two playing cards, an ace of spades and a king of
hearts, with a stack of chips (blackjack); a rocket shooting up a glowing green rising line with
sparks (crash). Row 2: two face-up playing cards on a small red velvet pad with a gold chip
(baccarat); a jade dragon head and an orange tiger head facing each other over a playing card
(dragon tiger); three red dice tumbling out of a gold and glass dice shaker (sic bo); a golden
trophy cup with violet chips flying around it (casino tournaments).

Delivered 2026-11-14: 4.0 and 4.0b shipped as `app/public/assets/menu/<name>.webp` (216 px, black
keyed out by a flood fill from each cell edge, so card spades stay). The Poker menu, the Casino tab
and the phone Home's Casino rows draw them; the casino trophy waits for a casino tournaments row.

### 4a. Home hero: November Chip Rush → `home-hero.png`

Shown very wide (about 3.2:1) at the top of the lobby, with the headline drawn on the left.

A towering golden poker trophy with a ruby spade emblem on a glossy black pedestal, surrounded by
an exploding spiral of glossy casino chips in red, gold, black and violet, two playing cards (an ace
and a king) flying past it, golden confetti and sparks, a burst of warm god rays behind it. Deep
crimson to black background. Keep every object in the right 55% of the frame and inside the middle
band (between 30% and 70% of the height); the left 45% stays dark crimson with only soft bokeh.

### 4b. "For You": Recent game → `home-recent.png`

Square-friendly: keep the subject in the centre, filling the middle 65% of the frame.

A glossy emerald-green poker table seen from a low three-quarter angle, a warm spotlight above it,
two face-up playing cards (ace of spades and king of hearts) floating just above the felt and
glowing at the edges, neat chip stacks in red and gold, empty plush seats around it. Teal and emerald
palette with gold highlights on a near-black background.

### 4c. Featured tournament: Masters → `home-masters.png`

Shown about 2.5:1 with the title drawn on the right, so keep the subject in the left 45% of the
frame, inside the middle band; the right side stays dark and calm.

A heavy royal gold crown with deep red velvet and ruby gems, resting on a tall stack of glossy black
and gold chips, a spotlight from above, gold dust in the air. Black and gold palette with deep red
accents.

### 4d. Featured tournament: Weekender → `home-weekender.png`

Same framing as 4c (subject in the left 45%).

A glossy 3D desk calendar flipped open to a blank page, with a cocktail glass, a pair of sunglasses
and a small pile of chips beside it, warm sunset light, a relaxed weekend mood. Sunset orange,
magenta and gold palette on a dark background.

### 4e. Featured tournament: Daily Guarantees → `home-daily.png`

Same framing as 4c (subject in the left 45%).

A glowing golden star medallion standing upright, ringed by a circular track of small glowing
lights like a clock face, chips and gold coins scattered at its base, gentle light rays. Gold and
warm amber palette on a deep navy background.

### 4f–4i. Special features (four prompts)

Shown about 1.6:1 with the label drawn along the bottom, so keep the subject centred in the upper
70% of the frame.

- **4f. Time Bank → `home-timebank.png`:** a glossy golden stopwatch with a glowing emerald face and
  a few chips beside it, time-trail light streaks around it. Emerald and gold palette.
- **4g. Run It Twice → `home-runittwice.png`:** two identical rows of five playing cards floating one
  above the other, each row glowing in a different colour (cyan and magenta), a curved double arrow
  of light looping between them. Deep blue palette.
- **4h. Social → `home-social.png`:** two glossy 3D chat bubbles and a pile of emoji-style reaction
  tokens (a heart, a thumbs-up, a laughing face) floating over a poker table edge. Warm orange and
  violet palette.
- **4i. Hand History → `home-handhistory.png`:** a glowing holographic replay panel above a poker
  table showing a row of playing cards and a rising light chart, a few chips in the foreground.
  Teal and purple palette.

---

## Step 5: Tournaments

### 5. Series emblems (one image, eight emblems) → `tourn-emblems.png`

**Size: square 1024×1024.** The tournament series tabs show a small emblem next to the series name
(drawn as text by the page). I cut the eight emblems out of one image.

A sprite sheet of eight glossy 3D game emblems arranged in a neat 4 × 2 grid with even spacing, each
emblem centred in its own cell on a plain flat near-black background, all lit the same way, all the
same size. Row 1: a golden trophy cup; a gold coin stamped with a large crown-shaped gem; four
fanned sapphire playing cards; a royal gold crown. Row 2: a red and white target bullseye (live
event); a golden prize wheel; a purple gem-studded mystery box; a golden lightning bolt striking a
coin.

---

## Step 6: Hold'em and PLO cash games

The cash lobbies show a banner carousel above the table list, very wide (about 5:1), with the title
drawn on the left. Keep every object in the right 50% of the frame and inside the middle band
(between 35% and 65% of the height); the left half stays dark with soft bokeh.

### 6a. Hold'em cash → `cash-holdem.png`

Two glossy face-down poker cards with a deep red back lifting off emerald felt, one corner peeled up
to reveal an ace of spades, thick stacks of red and gold chips beside them, a warm spotlight cone
from above. Emerald green and gold palette.

### 6b. PLO cash → `cash-plo.png`

Four glossy playing cards fanned in a tight arc above dark sapphire felt (aces and kings, mixed
suits), a tall stack of royal-blue and silver chips beside them, cool blue rim light with a warm gold
edge. Sapphire and electric blue palette.

### 6c. Bad Beat Jackpot → `cash-badbeat.png`

A massive golden vault door bursting open with gold coins and glossy chips pouring out toward the
camera, a cracked playing card (a losing full house) in the foreground, red alarm-style light beams
and sparks. Gold, crimson and black palette.

### 6d. Table preview felt → `cash-felt.png`

**Size: square 1024×1024.** Behind the table preview on the right of the cash lobby.

A top-down view of an empty oval poker table: rich emerald felt with a subtle woven texture and a
soft spotlight in the centre, a padded black leather rail with gold stitching, dark wood edge, the
table filling the frame edge to edge. No cards, no chips, no seats.

---

Paste each image into the chat (4a first). I crop each one to its slot, convert it to WebP, and wire
in the live layer.
