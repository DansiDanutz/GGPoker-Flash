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

Delivered 2026-11-14: shipped as `app/public/assets/ui/creatives/hero-november.webp` (3.2:1 crop);
the Home hero draws the headline as live text on its left side.

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

Delivered 2026-11-14: 4b–4i shipped as `foryou-recent`, `tourn-*` and `feature-*` `.webp` in
`app/public/assets/ui/creatives/`; the Home cards draw their titles, lines and buttons as live text.

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

**Delivered:** cut into eight transparent 256 px WebP files in `public/assets/ui/emblems/`
(`emblem-trophy`, `-crown-coin`, `-cards`, `-crown`, `-target`, `-wheel`, `-mystery`, `-bolt`). They replace
the baked-text series tabs and the flat badges on the phone Events format tiles.

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

**Delivered 6a–6c:** cropped to 1600×450 WebP (`cash-holdem`, `cash-plo`, `cash-badbeat`); the carousel
draws the titles and the live jackpot, and a tap opens that game's tab.

### 6d. Table preview felt → `cash-felt.png` (second take)

The first take (a flat, wide stadium table) was rejected. **Size: portrait 1024×1536.** Behind the
vertical table preview on the right of the cash lobby.

A vertical oval poker table seen from directly above, floating on a near-black background with a soft
emerald glow underneath. Deep emerald felt that fades to teal at the edges, a faint embossed pattern of
tiny spade suits across the cloth, a thin glowing gold line inset from the rail. The rail is polished
black lacquer with a warm gold trim and a soft rim light along the top edge. Empty table: no cards, no
chips, no seats. Saturated, vibrant, premium game-promo look, octane-style 3D render, glossy
materials, ultra detailed. No text, no letters, no numbers, no logos, no watermark, no people.

**Delivered:** cropped to the rail and saved as `cash-felt.webp` (440×758); it paints the cash lobby
table preview, whose own border and shadow are dropped in favour of the art's rail.

---

## Step 7: Remaining Home cards

Each prompt ends with the shared style text: *Saturated, vibrant, premium game-promo look, octane-style
3D render, rim light, volumetric light, glossy materials, shallow depth of field, ultra detailed. No
text, no letters, no numbers, no logos, no watermark, no people.* **Size: square 1024×1024**, subject in
the centre filling the middle 65% of the frame; the page draws the label on top.

### 7a. "For You": Daily Freebie → `foryou-freebie`

A glossy gift box wrapped in deep red with a big shiny gold ribbon bow, its lid popping open with a
burst of golden light, gold coins and a few red and gold poker chips spilling out, small sparkles in
the air. Crimson and gold palette on a near-black background with soft bokeh.

### 7b. "For You": DanGG Rewards → `foryou-ocean`

A gold-trimmed treasure chest half-open on a sandy sea floor, overflowing with pearls, gold coins and
glossy chips, shafts of light falling from the water surface above, small bubbles rising, coral
glowing at the edges. Turquoise, deep ocean blue and gold palette.

### 7c. "For You": Live Series → `foryou-live-series`

An empty grand tournament poker table on a stage under bright crossing spotlights, gold confetti
falling, large glowing blank screens and a lit arena in soft focus behind it. Royal purple, magenta
and gold palette.

### 7d. Casino: Olympus Gold → `casino-olympus-gold`

A golden Greek temple on a cloud-top summit, a bolt of lightning striking a giant gold coin in front
of it, marble columns with gold trim, glowing storm clouds. Gold, white marble and electric blue
palette.

### 7e. Casino: Disco Cat → `casino-disco-cat`

A cute glossy cartoon 3D cat wearing star-shaped sunglasses, sitting on a giant mirrored disco ball,
coloured light beams and sparkles all around, a glossy dance floor below. Hot pink, violet and cyan
neon palette.

### 7f. Casino: Robo Rush → `casino-robo-rush`

A cute rounded glossy robot with big glowing cyan eyes, jetting forward on a small rocket flame, gold
coins flying past it, a futuristic neon city in soft focus behind. Electric blue, chrome and orange
palette.

### 7g. Casino: Clover Cash → `casino-clover-cash`

A large glossy emerald four-leaf clover with gold edges standing on a pile of gold coins, a small
pot of gold beside it, a soft rainbow glow and sparkles behind. Emerald green and gold palette.

**Delivered 7a–7g:** For You cards cropped to 444×468 WebP and Casino tiles to 450×410 WebP. Each card
draws its name (and, for For You, a line and a button) as live text. The phone My Page promo rows use
the new For You art too.

---

## Step 8: Promotions

The Promotions page still uses tiny 226 px reference images stretched across wide cards, and the same
images are reused on My Page, Ocean, Welcome Bonus, the Battle Royale and Fast Fold heroes and the
tournament banners. **Size: landscape 1536×1024.** The title is drawn bottom-left, so keep every object
in the right 55% of the frame and inside the middle band; the left and bottom stay dark. Each prompt
ends with the shared style text from Step 7. Daily Freebie reuses 7a.

- **8a. Daily Chip Flipout** (`promo-flipout`): a giant gold coin spinning in mid-air above a tall stack of red and gold chips, a burst of sparks where it catches the light. Crimson and gold palette.
- **8b. Prize Wheel** (`promo-wheel`): a glossy golden prize wheel with jewel-coloured segments and gem studs, tilted toward the camera, sparks and gold coins flying off its rim. Gold, ruby and sapphire palette.
- **8c. Prize Wheel Platinum** (`promo-wheel-platinum`): the same kind of prize wheel in polished platinum and ice-blue diamonds, frosty light rays, crystal shards in the air. Silver, white and ice-blue palette.
- **8d. Player Care** (`promo-care`): a glossy emerald shield with a gold heart emblem standing in front of a stack of chips, a soft dome of protective light around them. Emerald, teal and gold palette.
- **8e. DanGG Rewards** (`promo-ocean`): a friendly glossy 3D whale leaping out of turquoise water, a spray of gems and pearls arcing around it, sunbeams through the waves. Turquoise, ocean blue and gold palette.
- **8f. Leaderboards** (`promo-leaderboard`): a three-step podium in gold, silver and bronze with a gold trophy on the top step, glowing rising bars behind it like a chart. Gold and deep blue palette.
- **8g. Battle Royale** (`promo-battle`): a glowing purple mystery box on a round arena platform, two crossed golden swords behind it, bounty coins scattered on the floor, dramatic purple spotlights. Violet, magenta and gold palette.
- **8h. Welcome Bonus** (`promo-welcome`): a red velvet box opening to reveal neat stacks of glossy chips and a golden key, a short red carpet leading up to it, gold confetti. Red, gold and warm white palette.
- **8i. Weekly Freeroll** (`promo-freeroll`): a single golden ticket with ornate blank edges floating above a pile of chips under a bright spotlight, small sparkles around it. Gold and midnight blue palette.
- **8j. After The Fold** (`promo-allin`): two face-down cards and every chip shoved forward into the middle of a dark felt table, a crackle of red lightning over the pile. Crimson, black and gold palette.
- **8k. Casino Bonus** (`promo-casino`): a glossy golden slot machine with three spinning reels showing cherries, gems and bells, coins pouring from its tray, neon glow. Gold, magenta and purple palette.
- **8l. Fast Fold** (`promo-fastfold`): a fan of glossy playing cards speeding forward with long neon motion trails, chips whipping past, a sense of speed. Electric green and gold palette.

**Delivered 8a–8l:** cropped to 1200×502 WebP in `public/assets/ui/promos/` and mapped in
`src/lib/promoArt.ts`. They are used on Promotions, My Page, Player Care, Welcome Bonus, the Battle Royale
and Fast Fold heroes, the Mystery tournament banner, the phone Casino header and the Casino Slots tile.
All four leaderboard cards share 8f (Fast Fold's uses 8l); Daily Freebie reuses 7a.

---

## Step 9: Casino table games

The Casino page tiles still borrow poker images (Roulette shows the All-in art, Blackjack a tournament
banner). **Size: landscape 1536×1024**, same framing as Step 8: the game name is drawn bottom-left, so keep
every object in the right 55% of the frame and inside the middle band. Each prompt ends with the shared
style text from Step 7.

- **9a. Roulette** (`casino-roulette`): a glossy European roulette wheel in polished mahogany and gold, tilted toward the camera, a white ball caught mid-bounce, a few chips stacked beside it. Deep red, black and gold palette.
- **9b. Blackjack** (`casino-blackjack`): an ace and a king of spades fanned face-up on emerald felt, a neat stack of chips beside them, a soft spotlight from above. Emerald, black and gold palette.
- **9c. Crash** (`casino-crash`): a glossy cartoon rocket blasting up and to the right along a glowing rising line, sparks and a few gold coins trailing behind it. Electric orange, hot pink and midnight blue palette.
- **9d. Baccarat** (`casino-baccarat`): two face-up cards on rich navy felt split by a thin gold line into two halves, one side glowing blue and the other red, a stack of gold chips between them. Navy, crimson and gold palette.
- **9e. Dragon Tiger** (`casino-dragontiger`): a glossy jade dragon head and a glossy golden tiger head facing each other, a single face-up card glowing between them, swirling mist. Jade green, amber and red palette.
- **9f. Sic Bo** (`casino-sicbo`): three glossy translucent red dice tumbling in mid-air above a gold bowl, small sparkles and a soft glow around them. Crimson, gold and black palette.
- **9g. Casino Hold'em** (`casino-holdem`): three face-up community cards on dark blue felt with two face-down cards in front of them, a small gold dealer button and a stack of chips, a cool spotlight. Sapphire, white and gold palette.

---

Paste each image into the chat (4a first). I crop each one to its slot, convert it to WebP, and wire
in the live layer.

---

## Step 10: Menu emblems (one image, eight emblems) → `menu-emblems.png`

**Size: square 1024×1024.** The desktop game-mode row and the phone menus show a small emblem
next to a live text label. Four existing emblems are reused: All-in or Fold (target), Fast Fold (bolt),
PLO (four cards), Jackpot SNG (prize wheel); Tournaments keeps the trophy. This sheet fills the rest,
in the same style as Step 5 so the set matches.

A sprite sheet of eight glossy 3D game emblems arranged in a neat 4 × 2 grid with even spacing, each
emblem centred in its own cell on a plain flat near-black background, all lit the same way, all the
same size. Row 1: a small glossy golden house with a ruby-red roof (home); two playing cards, an ace
and a king of spades, crossed at an angle (Hold'em); a short half-height stack of playing cards with a
glowing gold edge (Short Deck); two crossed golden swords over a red shield (Battle Royale). Row 2: a
red and gold casino chip with a spade in the centre (poker); a small golden slot machine with three
cherry reels; a glossy roulette wheel seen from above at an angle; a red gift box with a gold ribbon
(rewards). Saturated, vibrant, octane-style 3D render, rim light, glossy materials, ultra detailed. No
text, no letters, no numbers, no logos, no watermark.
