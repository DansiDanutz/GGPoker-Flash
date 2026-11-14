# Step 3: "For You" promotion cards (generate in ChatGPT)

The promotion cards under the home banner show a wide art strip (about 2.8:1, 104 px tall on the
phone) with the title and subtitle as page text below it. Today they reuse small 226×230 square
tiles, which look soft and flat when stretched. Each prompt below makes one sharp, photo-real strip.

**Size for all eight: landscape 1536×1024.** Only the middle band is shown, so the subject sits in
the centre, filling the band edge to edge. No headline space is needed (the text is below the art).

Shared ending (paste at the end of every prompt):

> Keep the subject centred and inside the central horizontal band (between 32% and 68% of the image
> height), spreading wide left to right; fill the rest with matching soft background, bokeh and light.
> Saturated, vibrant, premium game-promo look, octane-style 3D render, rim light, volumetric light,
> glossy materials, shallow depth of field, ultra detailed. No text, no letters, no numbers, no
> logos, no watermark, no people.

## 3a. Daily Freebie → `promo-freebie.png`

A glossy ruby-red gift box with a gold satin ribbon bursting open, gold coins and glossy chips
spilling out sideways, golden sparkles, warm red and gold palette on a deep crimson background.

## 3b. Weekly Freeroll → `promo-freeroll.png`

A shining golden admission ticket with a perforated edge floating at an angle, flanked by fanned
playing cards and a few gold chips, light rays behind it, emerald green and gold palette.

## 3c. Welcome Bonus → `promo-welcome.png`

An open treasure chest overflowing with gold coins, glossy casino chips and gems, warm golden light
pouring out of it, purple and gold palette with magenta rim light.

## 3d. Prize Wheel → `promo-wheel.png`

A glossy prize wheel seen straight on, segments in sapphire, gold and white with gold studs around
the rim, a gold pointer at the top, coins and sparkles orbiting it, deep blue background.

## 3e. DanGG Rewards → `promo-rewards.png`

A friendly glossy 3D whale swimming through a glowing underwater reef, trailing colourful glowing
gems (sapphire, emerald, ruby, gold) and bubbles, turquoise and teal palette with god rays from above.

## 3f. Hold'em Leaderboard → `promo-leaderboard.png`

A three-step winners' podium in gold, silver and bronze with a gleaming gold trophy cup on the top
step, chips stacked on the lower steps, confetti and spotlights, royal purple background.

## 3g. Player Care → `promo-care.png`

A glossy shield in deep blue enamel with a gold rim and a glowing red heart in its centre, protecting
a pair of playing cards behind it, soft protective light glow, calm blue and gold palette.

## 3h. Casino Bonus → `promo-casino.png`

A glossy slot machine reel window with three spinning reels showing cherries, sevens-free fruit and
gold bells, coins shooting out, neon pink and gold lights, magenta and violet palette.

---

Delivered 2026-11-14 and shipped as `app/public/assets/promo/<key>.webp` (840×300 crops of the
middle band; 3e serves the `rewards` card, 3f the `leaderboard` card). Live layer: a slow shine sweep
across each strip (staggered per card, off under reduced motion) and a press zoom. All eight cards
now show in the "For You" rail (it used to show only the first four).

## Also on the list (no new art needed)

- The "Connecting to DanGG…" loading screen is flat grey; it will reuse the login splash art and sparks.
